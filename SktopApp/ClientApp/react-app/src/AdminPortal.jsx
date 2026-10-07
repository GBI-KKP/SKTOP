import React, { useEffect, useMemo, useRef, useState } from 'react';
import { asMoney, downloadTextFile } from './utils.js';
import { useResponsivePagination } from './useResponsivePagination.js';
import ListPagination from './ListPagination.jsx';
import SktopLogo from './SktopLogo.jsx';

export default function AdminPortal(props) {
    const allowedAdminTabs = new Set(['orders', 'reports', 'inventory', 'crm']);
    const baseUrl = (() => {
        const raw = typeof props?.baseUrl === 'string' ? props.baseUrl : '/';
        const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
        return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
    })();

    const withBaseUrl = (path) => {
        const trimmed = typeof path === 'string' ? path : '';
        return `${baseUrl}${trimmed.replace(/^\/+/, '')}`;
    };

    const auth = props?.auth || {};
    const antiForgery = props?.antiForgery || {};

    const resolvedInitialView = (() => {
        const allowedViews = new Set(['admin-dashboard']);

        const queryView =
            typeof window !== 'undefined'
                ? new URLSearchParams(window.location.search).get('view')
                : null;

        const requested = props?.initialView || (allowedViews.has(queryView || '') ? queryView : null) || 'admin-dashboard';
        return allowedViews.has(requested) ? requested : 'admin-dashboard';
    })();

    const resolvedInitialAdminTab = (() => {
        if (typeof window === 'undefined') return 'orders';
        const queryAdminTab = new URLSearchParams(window.location.search).get('adminTab');
        return allowedAdminTabs.has(queryAdminTab || '') ? queryAdminTab : 'orders';
    })();

    const [view, setView] = useState(resolvedInitialView);
    const [adminTab, setAdminTab] = useState(resolvedInitialAdminTab);
    const [mobileMenu, setMobileMenu] = useState(false);
    const isLoggedIn = Boolean(auth?.isAuthenticated);
    const isAdmin = String(auth?.role || '').toLowerCase() === 'admin';

    const [editMode, setEditMode] = useState(false);
    const [customerEditMode, setCustomerEditMode] = useState(false);
    const [showOrderDetails, setShowOrderDetails] = useState(false);
    const [showClientDetails, setShowClientDetails] = useState(false);

    const [editingProduct, setEditingProduct] = useState(null);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [selectedClient, setSelectedClient] = useState(null);

    const [reportFilter, setReportFilter] = useState({
        year: '',
        customer: [],
        status: '',
        productType: '',
        custSearch: '',
    });

    const adminBootstrap = props?.adminBootstrap && typeof props.adminBootstrap === 'object'
        ? props.adminBootstrap
        : null;

    const [categories, setCategories] = useState(() => {
        if (Array.isArray(adminBootstrap?.categories)) return adminBootstrap.categories;
        return Array.isArray(props?.categories) ? props.categories : [];
    });
    const [newCategoryName, setNewCategoryName] = useState('');

    const [products, setProducts] = useState(() => {
        if (Array.isArray(adminBootstrap?.products)) return adminBootstrap.products;
        const initialProducts = props?.initialProducts;
        return Array.isArray(initialProducts) ? initialProducts : [];
    });

    const derivedCategories = useMemo(() => {
        const values = products
            .map((p) => p?.category)
            .filter((c) => typeof c === 'string' && c.trim() !== '');
        return Array.from(new Set(values)).sort();
    }, [products]);

    useEffect(() => {
        if (categories.length > 0) return;
        if (derivedCategories.length === 0) return;
        setCategories(derivedCategories);
    }, [categories.length, derivedCategories]);

    const [orders, setOrders] = useState(() => {
        if (Array.isArray(adminBootstrap?.orders)) return adminBootstrap.orders;
        const initialOrders = props?.initialOrders;
        return Array.isArray(initialOrders) ? initialOrders : [];
    });

    const [customers, setCustomers] = useState(() =>
        Array.isArray(adminBootstrap?.customers) ? adminBootstrap.customers : []
    );
    const [newProduct, setNewProduct] = useState({
        type: 'Product',
        category: categories[0] || '',
        name: '',
        desc: '',
        qty: 0,
        qtyControl: false,
        minPrice: 0,
        maxPrice: 0,
        isActive: true,
        images: [],
    });

    const [newCustomer, setNewCustomer] = useState({
        company: '',
        email: '',
        password: '',
        isActive: true,
        category: [],
        personInCharge: '',
        contactNo: '',
        address: '',
        companyRegNo: '',
        eInvoiceNo: '',
    });

    const emptyCustomerForm = {
        company: '',
        email: '',
        password: '',
        isActive: true,
        category: [],
        personInCharge: '',
        contactNo: '',
        address: '',
        companyRegNo: '',
        eInvoiceNo: '',
    };

    const [reportSuggestionsOpen, setReportSuggestionsOpen] = useState(false);
    const reportSuggestionsRef = useRef(null);

    const filteredOrders = useMemo(() => {
        return orders.filter((o) => {
            const matchesYear = reportFilter.year === '' || o.date.startsWith(reportFilter.year);
            const matchesCustomer = reportFilter.customer.length === 0 || reportFilter.customer.includes(o.customer);
            const matchesStatus = reportFilter.status === '' || o.status === reportFilter.status;
            const matchesType =
                reportFilter.productType === '' || o.items.some((item) => item.type === reportFilter.productType);
            return matchesYear && matchesCustomer && matchesStatus && matchesType;
        });
    }, [orders, reportFilter]);

    const [ledgerSort, setLedgerSort] = useState({ key: 'date', dir: 'desc' });
    const [ledgerStatusFilter, setLedgerStatusFilter] = useState('Pending');
    const [reportSort, setReportSort] = useState({ key: 'date', dir: 'desc' });

    function orderTypeLabel(order) {
        return Array.from(new Set((order?.items || []).map((i) => i?.type).filter(Boolean))).join(', ');
    }

    function sortOrdersList(list, sort) {
        const dir = sort.dir === 'asc' ? 1 : -1;
        return [...list].sort((a, b) => {
            let av;
            let bv;
            switch (sort.key) {
                case 'id':
                    av = String(a?.id || '');
                    bv = String(b?.id || '');
                    break;
                case 'customer':
                    av = String(a?.customer || '').toLowerCase();
                    bv = String(b?.customer || '').toLowerCase();
                    break;
                case 'status':
                    av = String(a?.status || '').toLowerCase();
                    bv = String(b?.status || '').toLowerCase();
                    break;
                case 'productType':
                    av = orderTypeLabel(a).toLowerCase();
                    bv = orderTypeLabel(b).toLowerCase();
                    break;
                case 'date':
                default:
                    av = String(a?.date || '');
                    bv = String(b?.date || '');
                    break;
            }
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return 0;
        });
    }

    function toggleSort(setter, key) {
        setter((prev) => {
            if (prev.key === key) {
                return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
            }
            return { key, dir: key === 'date' ? 'desc' : 'asc' };
        });
    }

    function SortButton({ label, sortKey, sort, onToggle }) {
        const active = sort.key === sortKey;
        const iconClass = active
            ? sort.dir === 'asc'
                ? 'fas fa-sort-up'
                : 'fas fa-sort-down'
            : 'fas fa-sort';
        return (
            <button
                type="button"
                onClick={() => onToggle(sortKey)}
                className={`inline-flex items-center gap-1.5 uppercase tracking-widest transition ${active ? 'text-[#644117]' : 'text-gray-400 hover:text-gray-700'}`}
            >
                {label}
                <i className={`${iconClass} text-[11px] leading-none`} aria-hidden="true"></i>
            </button>
        );
    }

    const filteredLedgerOrders = useMemo(() => {
        if (ledgerStatusFilter === '') return orders;
        return orders.filter((o) => o.status === ledgerStatusFilter);
    }, [orders, ledgerStatusFilter]);

    const sortedLedgerOrders = useMemo(
        () => sortOrdersList(filteredLedgerOrders, ledgerSort),
        [filteredLedgerOrders, ledgerSort]
    );
    const sortedReportOrders = useMemo(() => sortOrdersList(filteredOrders, reportSort), [filteredOrders, reportSort]);

    const ledgerPagination = useResponsivePagination(
        sortedLedgerOrders,
        `ledger:${filteredLedgerOrders.length}|${ledgerStatusFilter}|${ledgerSort.key}|${ledgerSort.dir}`
    );
    const reportsResetKey = `${reportFilter.year}|${reportFilter.status}|${reportFilter.productType}|${(reportFilter.customer || []).join(',')}|${filteredOrders.length}|${reportSort.key}|${reportSort.dir}`;
    const reportsPagination = useResponsivePagination(sortedReportOrders, reportsResetKey);
    const productsPagination = useResponsivePagination(products, `products:${products.length}`);
    const customersPagination = useResponsivePagination(customers, `customers:${customers.length}`);

    const hasSsrBootstrap =
        Array.isArray(adminBootstrap?.products) ||
        Array.isArray(adminBootstrap?.orders) ||
        Array.isArray(adminBootstrap?.customers) ||
        Array.isArray(adminBootstrap?.categories);

    const [adminBootstrapLoaded, setAdminBootstrapLoaded] = useState(hasSsrBootstrap);
    const [adminBootstrapLoading, setAdminBootstrapLoading] = useState(false);

    async function refreshAdminTabData(tab = adminTab) {
        if (!isAdmin) return;
        setAdminBootstrapLoading(true);
        try {
            const response = await fetch(
                withBaseUrl(`/Admin/Bootstrap?tab=${encodeURIComponent(tab)}`),
                { credentials: 'same-origin' }
            );
            if (!response.ok) throw new Error('tab refresh failed');
            const data = await response.json();

            // Apply only the datasets returned for this tab.
            if (Object.prototype.hasOwnProperty.call(data, 'categories') && Array.isArray(data.categories)) {
                setCategories(data.categories);
            }
            if (Object.prototype.hasOwnProperty.call(data, 'products') && Array.isArray(data.products)) {
                setProducts(data.products);
            }
            if (Object.prototype.hasOwnProperty.call(data, 'customers') && Array.isArray(data.customers)) {
                setCustomers(data.customers);
            }
            if (Object.prototype.hasOwnProperty.call(data, 'orders') && Array.isArray(data.orders)) {
                setOrders(data.orders);
            }
            setAdminBootstrapLoaded(true);
        } catch {
            if (!hasSsrBootstrap && !adminBootstrapLoaded) {
                setAdminBootstrapLoaded(false);
            }
        } finally {
            setAdminBootstrapLoading(false);
        }
    }

    useEffect(() => {
        if (!isAdmin || view !== 'admin-dashboard') return;
        refreshAdminTabData(adminTab);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adminTab, isAdmin, view]);

    function closeMobileMenu() {
        setMobileMenu(false);
    }

    function switchAdminTab(nextTab) {
        if (!allowedAdminTabs.has(nextTab)) return;

        if (nextTab === adminTab) {
            refreshAdminTabData(nextTab);
            closeMobileMenu();
            return;
        }

        setAdminTab(nextTab);
        closeMobileMenu();
        if (typeof window === 'undefined') return;

        const params = new URLSearchParams(window.location.search);
        params.set('view', 'admin-dashboard');
        params.set('adminTab', nextTab);
        const query = params.toString();
        const target = query ? `${window.location.pathname}?${query}` : window.location.pathname;
        window.history.replaceState({}, '', target);
    }

    function goToView(nextView) {
        setView(nextView);
        closeMobileMenu();
    }

    function logout() {
        const headerName = antiForgery?.headerName;
        const requestToken = antiForgery?.requestToken;

        if (!headerName || !requestToken) {
            window.location.assign(withBaseUrl('/Account/Login'));
            return;
        }

        fetch(withBaseUrl('/Account/Logout'), {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                [headerName]: requestToken,
            },
        })
            .catch(() => { })
            .finally(() => {
                window.location.assign(baseUrl);
            });
    }

    function toggleCustFilter(name) {
        setReportFilter((prev) => {
            const included = prev.customer.includes(name);
            const nextCustomer = included ? prev.customer.filter((c) => c !== name) : [...prev.customer, name];
            return { ...prev, customer: nextCustomer, custSearch: '' };
        });
    }

    function sanitizeIntegerInput(value) {
        return String(value ?? '').replace(/[^\d]/g, '');
    }

    function sanitizeDecimalInput(value) {
        let next = String(value ?? '').replace(/[^\d.]/g, '');
        const firstDot = next.indexOf('.');
        if (firstDot !== -1) {
            next = `${next.slice(0, firstDot + 1)}${next.slice(firstDot + 1).replace(/\./g, '')}`;
        }
        return next;
    }

    function resolveMinMaxPrice(rawMin, rawMax) {
        const minRaw = String(rawMin ?? '').trim();
        const maxRaw = String(rawMax ?? '').trim();
        const minPrice = Number(minRaw);
        const maxParsed = maxRaw === '' ? 0 : Number(maxRaw);

        if (!Number.isFinite(minPrice) || minPrice <= 0) {
            return { ok: false, error: 'Min Price is required and must be greater than 0.' };
        }

        // Blank or 0 max → copy min into max.
        if (!Number.isFinite(maxParsed) || maxParsed === 0) {
            return { ok: true, minPrice, maxPrice: minPrice };
        }

        // Non-zero max below min → keep existing validation.
        if (maxParsed < minPrice) {
            return { ok: false, error: 'Max Price must be greater than or equal to Min Price.' };
        }

        return { ok: true, minPrice, maxPrice: maxParsed };
    }

    function handleImageUpload(event, target) {
        const files = Array.from(event.target.files || []).slice(0, 3);
        if (files.length === 0) return;

        const readAsDataUrl = (file) =>
            new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(new Error('Unable to read file.'));
                reader.readAsDataURL(file);
            });

        Promise.all(files.map(readAsDataUrl))
            .then((newImages) => newImages.filter((s) => typeof s === 'string' && s.trim() !== ''))
            .then((newImages) => {
                if (newImages.length === 0) return;

                if (target === 'edit') {
                    setEditingProduct((prev) => {
                        if (!prev) return prev;
                        const existing = Array.isArray(prev.images) ? prev.images : [];
                        const remaining = Math.max(0, 3 - existing.length);
                        const toAdd = newImages.slice(0, remaining);
                        return { ...prev, images: [...existing, ...toAdd] };
                    });
                    return;
                }

                setNewProduct((prev) => {
                    const existing = Array.isArray(prev.images) ? prev.images : [];
                    const remaining = Math.max(0, 3 - existing.length);
                    const toAdd = newImages.slice(0, remaining);
                    return { ...prev, images: [...existing, ...toAdd] };
                });
            })
            .catch(() => { })
            .finally(() => {
                if (event?.target) {
                    event.target.value = '';
                }
            });
    }

    function removeProductImage(target, index) {
        if (!Number.isFinite(index) || index < 0) return;

        if (target === 'edit') {
            setEditingProduct((prev) => {
                if (!prev) return prev;
                const list = Array.isArray(prev.images) ? prev.images : [];
                return { ...prev, images: list.filter((_, i) => i !== index) };
            });
            return;
        }

        setNewProduct((prev) => {
            const list = Array.isArray(prev.images) ? prev.images : [];
            return { ...prev, images: list.filter((_, i) => i !== index) };
        });
    }

    function toggleAllCategories(target) {
        if (target === 'edit') {
            setEditingCustomer((prev) => {
                if (!prev) return prev;
                const next = prev.category?.length === categories.length ? [] : [...categories];
                return { ...prev, category: next };
            });
            return;
        }

        setNewCustomer((prev) => {
            const next = prev.category.length === categories.length ? [] : [...categories];
            return { ...prev, category: next };
        });
    }

    function toggleCategory(cat, target) {
        if (target === 'edit') {
            setEditingCustomer((prev) => {
                if (!prev) return prev;
                const list = Array.isArray(prev.category) ? prev.category : [];
                const next = list.includes(cat) ? list.filter((c) => c !== cat) : [...list, cat];
                return { ...prev, category: next };
            });
            return;
        }

        setNewCustomer((prev) => {
            const next = prev.category.includes(cat) ? prev.category.filter((c) => c !== cat) : [...prev.category, cat];
            return { ...prev, category: next };
        });
    }

    function exportToExcel() {
        const csvCell = (value) => {
            const s = String(value ?? '');
            if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
        };

        let csv = 'Order ID,Date,Client,Product Type,Status\n';
        filteredOrders.forEach((o) => {
            const types = Array.from(new Set(o.items.map((i) => i.type))).join(' & ');
            csv += `${csvCell(o.id)},${csvCell(o.date)},${csvCell(o.customer)},${csvCell(types)},${csvCell(o.status)}\n`;
        });
        downloadTextFile(`SKTOP_Report_${reportFilter.year || 'All'}.csv`, csv, 'text/csv');
    }

    async function addCategory() {
        const trimmed = newCategoryName.trim();
        if (trimmed === '' || categories.includes(trimmed)) return;

        if (isAdmin) {
            const headerName = antiForgery?.headerName;
            const requestToken = antiForgery?.requestToken;
            if (!headerName || !requestToken) return;

            const response = await fetch(withBaseUrl('/Admin/AddCategory'), {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    [headerName]: requestToken,
                },
                body: JSON.stringify({ name: trimmed }),
            });

            if (!response.ok) return;
        }

        setCategories((prev) => [...prev, trimmed]);
        setNewCategoryName('');
    }

    async function deleteCategory(cat) {
        if (confirm('Delete this category? Products already assigned will remain.')) {
            if (isAdmin) {
                const headerName = antiForgery?.headerName;
                const requestToken = antiForgery?.requestToken;
                if (!headerName || !requestToken) return;

                const response = await fetch(withBaseUrl('/Admin/DeleteCategory'), {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        [headerName]: requestToken,
                    },
                    body: JSON.stringify({ name: cat }),
                });

                if (!response.ok) return;
            }

            setCategories((prev) => prev.filter((c) => c !== cat));
        }
    }

    async function addProduct() {
        const payload = { ...newProduct };
        const nextCategory = categories.includes(payload.category) ? payload.category : categories[0] || null;
        const trimmedType = String(payload.type || '').trim();
        const trimmedName = String(payload.name || '').trim();
        const trimmedCategory = String(nextCategory || '').trim();
        const price = resolveMinMaxPrice(payload.minPrice, payload.maxPrice);
        const qtyControl = Boolean(payload.qtyControl);
        const qty = qtyControl ? Number(payload.qty) : 0;

        if (!trimmedType || !trimmedCategory || !trimmedName) {
            alert('Asset Type, Category, and Asset Name are required.');
            return;
        }

        if (!price.ok) {
            alert(price.error);
            return;
        }

        const { minPrice, maxPrice } = price;

        if (qtyControl && (!Number.isFinite(qty) || qty <= 0)) {
            alert('Qty is required when Qty Control is Yes.');
            return;
        }

        if (isAdmin) {
            const headerName = antiForgery?.headerName;
            const requestToken = antiForgery?.requestToken;
            if (!headerName || !requestToken) return;

            const response = await fetch(withBaseUrl('/Admin/CreateProduct'), {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    [headerName]: requestToken,
                },
                body: JSON.stringify({
                    type: trimmedType,
                    name: trimmedName,
                    desc: payload.desc,
                    minPrice,
                    maxPrice,
                    qty: qtyControl ? Math.max(1, parseInt(String(payload.qty), 10) || 1) : 0,
                    qtyControl,
                    category: trimmedCategory,
                    isActive: Boolean(payload.isActive),
                    images: Array.isArray(payload.images) ? payload.images : [],
                }),
            });

            if (!response.ok) return;
            const data = await response.json().catch(() => ({}));
            const id = Number(data?.id);
            if (!Number.isFinite(id) || id <= 0) return;

            setProducts((prev) => [
                ...prev,
                {
                    ...payload,
                    type: trimmedType,
                    name: trimmedName,
                    minPrice,
                    maxPrice,
                    id,
                    category: trimmedCategory,
                    qty: qtyControl ? Math.max(1, parseInt(String(payload.qty), 10) || 1) : 0,
                    qtyControl,
                    isActive: Boolean(payload.isActive),
                    images: Array.isArray(payload.images) ? payload.images : [],
                },
            ]);
        } else {
            setProducts((prev) => [
                ...prev,
                { ...payload, type: trimmedType, name: trimmedName, minPrice, maxPrice, id: Date.now(), category: trimmedCategory, qty: qtyControl ? Math.max(1, parseInt(String(payload.qty), 10) || 1) : 0, qtyControl },
            ]);
        }

        setNewProduct({
            type: 'Product',
            category: categories[0] || '',
            name: '',
            desc: '',
            qty: 0,
            qtyControl: false,
            minPrice: 0,
            maxPrice: 0,
            isActive: true,
            images: [],
        });
    }

    async function startEdit(product) {
        const fallback = () => {
            const clone = JSON.parse(JSON.stringify(product));
            if (!clone.type) clone.type = 'Product';
            if (!clone.images) clone.images = [];
            if (typeof clone.isActive !== 'boolean') clone.isActive = true;
            if (typeof clone.qtyControl !== 'boolean') clone.qtyControl = true;
            setEditingProduct(clone);
            setEditMode(true);
        };

        if (!isAdmin || !product?.id) {
            fallback();
            return;
        }

        try {
            const response = await fetch(withBaseUrl(`/Admin/Product?id=${encodeURIComponent(product.id)}`), {
                credentials: 'same-origin',
            });
            if (!response.ok) {
                fallback();
                return;
            }
            const full = await response.json();
            const clone = JSON.parse(JSON.stringify(full || product));
            if (!clone.type) clone.type = 'Product';
            if (!clone.images) clone.images = [];
            if (typeof clone.isActive !== 'boolean') clone.isActive = true;
            if (typeof clone.qtyControl !== 'boolean') clone.qtyControl = true;
            setEditingProduct(clone);
            setEditMode(true);
        } catch {
            fallback();
        }
    }

    async function saveEdit() {
        if (!editingProduct) return;
        const trimmedType = String(editingProduct.type || '').trim();
        const trimmedName = String(editingProduct.name || '').trim();
        const trimmedCategory = String(editingProduct.category || '').trim();
        const price = resolveMinMaxPrice(editingProduct.minPrice, editingProduct.maxPrice);
        const qtyControl = Boolean(editingProduct.qtyControl);
        const qty = qtyControl ? Number(editingProduct.qty) : 0;

        if (!trimmedType || !trimmedCategory || !trimmedName) {
            alert('Asset Type, Category, and Asset Name are required.');
            return;
        }

        if (!price.ok) {
            alert(price.error);
            return;
        }

        const { minPrice, maxPrice } = price;

        if (qtyControl && (!Number.isFinite(qty) || qty <= 0)) {
            alert('Qty is required when Qty Control is Yes.');
            return;
        }

        if (isAdmin) {
            const headerName = antiForgery?.headerName;
            const requestToken = antiForgery?.requestToken;
            if (!headerName || !requestToken) return;

            const response = await fetch(withBaseUrl('/Admin/UpdateProduct'), {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    [headerName]: requestToken,
                },
                body: JSON.stringify({
                    id: editingProduct.id,
                    type: trimmedType,
                    name: trimmedName,
                    desc: editingProduct.desc,
                    minPrice,
                    maxPrice,
                    qty: qtyControl ? Math.max(1, parseInt(String(editingProduct.qty), 10) || 1) : 0,
                    qtyControl,
                    category: trimmedCategory,
                    isActive: Boolean(editingProduct.isActive),
                    images: Array.isArray(editingProduct.images) ? editingProduct.images : [],
                }),
            });

            if (!response.ok) return;
        }

        setProducts((prev) =>
            prev.map((p) =>
                p.id === editingProduct.id
                    ? {
                        ...editingProduct,
                        type: trimmedType,
                        name: trimmedName,
                        category: trimmedCategory,
                        minPrice,
                        maxPrice,
                        qty: qtyControl ? Math.max(1, parseInt(String(editingProduct.qty), 10) || 1) : 0,
                        qtyControl,
                        isActive: Boolean(editingProduct.isActive),
                    }
                    : p,
            ),
        );
        setEditMode(false);
    }

    async function deleteProduct(id) {
        if (confirm('Confirm deletion of this asset?')) {
            if (isAdmin) {
                const headerName = antiForgery?.headerName;
                const requestToken = antiForgery?.requestToken;
                if (!headerName || !requestToken) return;

                const response = await fetch(withBaseUrl('/Admin/DeleteProduct'), {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        [headerName]: requestToken,
                    },
                    body: JSON.stringify({ id }),
                });

                if (!response.ok) {
                    const errorJson = await response.json().catch(() => null);
                    const errorText = errorJson?.error || (await response.text().catch(() => ''));
                    alert(errorText || 'Unable to delete asset.');
                    return;
                }
            }

            setProducts((prev) => prev.filter((p) => p.id !== id));
        }
    }

    async function createCustomer() {
        const payload = { ...newCustomer };
        const cats = Array.isArray(payload.category) ? payload.category : [];
        if (cats.length === 0) {
            alert('Please select at least one Segment.');
            return;
        }

        if (isAdmin) {
            const headerName = antiForgery?.headerName;
            const requestToken = antiForgery?.requestToken;
            if (!headerName || !requestToken) return;

            const response = await fetch(withBaseUrl('/Admin/CreateCustomer'), {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    [headerName]: requestToken,
                },
                body: JSON.stringify({
                    company: payload.company,
                    email: payload.email,
                    password: payload.password,
                    isActive: Boolean(payload.isActive),
                    category: cats,
                    personInCharge: payload.personInCharge || '',
                    contactNo: payload.contactNo || '',
                    address: payload.address || '',
                    companyRegNo: payload.companyRegNo || '',
                    eInvoiceNo: payload.eInvoiceNo || '',
                }),
            });

            if (!response.ok) return;
            const data = await response.json().catch(() => ({}));
            const id = Number(data?.id);
            if (!Number.isFinite(id) || id <= 0) return;

            setCustomers((prev) => [
                ...prev,
                {
                    ...payload,
                    id,
                    category: cats,
                    isActive: Boolean(payload.isActive),
                    personInCharge: payload.personInCharge || '',
                    contactNo: payload.contactNo || '',
                    address: payload.address || '',
                    companyRegNo: payload.companyRegNo || '',
                    eInvoiceNo: payload.eInvoiceNo || '',
                },
            ]);
        } else {
            setCustomers((prev) => [...prev, { ...payload, id: Date.now(), category: cats, isActive: Boolean(payload.isActive) }]);
        }

        setNewCustomer({ ...emptyCustomerForm });
    }

    function startCustomerEdit(customer) {
        const clone = JSON.parse(JSON.stringify(customer));
        if (!Array.isArray(clone.category)) {
            clone.category = clone.category ? [clone.category] : [];
        }
        if (typeof clone.isActive !== 'boolean') clone.isActive = true;
        clone.personInCharge = clone.personInCharge || '';
        clone.contactNo = clone.contactNo || '';
        clone.address = clone.address || '';
        clone.companyRegNo = clone.companyRegNo || '';
        clone.eInvoiceNo = clone.eInvoiceNo || '';
        setEditingCustomer(clone);
        setCustomerEditMode(true);
    }

    async function saveCustomerEdit() {
        if (!editingCustomer) return;
        const cats = Array.isArray(editingCustomer.category) ? editingCustomer.category : [];
        if (cats.length === 0) {
            alert('Please select at least one Segment.');
            return;
        }

        if (isAdmin) {
            const headerName = antiForgery?.headerName;
            const requestToken = antiForgery?.requestToken;
            if (!headerName || !requestToken) return;

            const response = await fetch(withBaseUrl('/Admin/UpdateCustomer'), {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    [headerName]: requestToken,
                },
                body: JSON.stringify({
                    id: editingCustomer.id,
                    company: editingCustomer.company,
                    email: editingCustomer.email,
                    password: editingCustomer.password,
                    isActive: Boolean(editingCustomer.isActive),
                    category: cats,
                    personInCharge: editingCustomer.personInCharge || '',
                    contactNo: editingCustomer.contactNo || '',
                    address: editingCustomer.address || '',
                    companyRegNo: editingCustomer.companyRegNo || '',
                    eInvoiceNo: editingCustomer.eInvoiceNo || '',
                }),
            });

            if (!response.ok) return;
        }

        setCustomers((prev) =>
            prev.map((c) =>
                c.id === editingCustomer.id
                    ? {
                          ...editingCustomer,
                          category: cats,
                          isActive: Boolean(editingCustomer.isActive),
                          personInCharge: editingCustomer.personInCharge || '',
                          contactNo: editingCustomer.contactNo || '',
                          address: editingCustomer.address || '',
                          companyRegNo: editingCustomer.companyRegNo || '',
                          eInvoiceNo: editingCustomer.eInvoiceNo || '',
                      }
                    : c
            )
        );
        setCustomerEditMode(false);
    }

    async function deleteCustomer(id) {
        if (confirm('Permanently remove this customer profile?')) {
            if (isAdmin) {
                const headerName = antiForgery?.headerName;
                const requestToken = antiForgery?.requestToken;
                if (!headerName || !requestToken) return;

                const response = await fetch(withBaseUrl('/Admin/DeleteCustomer'), {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        [headerName]: requestToken,
                    },
                    body: JSON.stringify({ id }),
                });

                if (!response.ok) {
                    const errorJson = await response.json().catch(() => null);
                    const errorText = errorJson?.error || (await response.text().catch(() => ''));
                    alert(errorText || 'Unable to delete customer.');
                    return;
                }
            }

            setCustomers((prev) => prev.filter((c) => c.id !== id));
        }
    }

    async function setOrderDelivered(orderId) {
        if (confirm("Confirm to set delivered?")) {
            const order = orders.find((o) => o.id === orderId);
            if (!order || order.status === 'Delivered') return;

            const nextStatus = 'Delivered';

            if (isAdmin) {
                const headerName = antiForgery?.headerName;
                const requestToken = antiForgery?.requestToken;
                if (!headerName || !requestToken) return;

                const response = await fetch(withBaseUrl('/Admin/UpdateOrderStatus'), {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        [headerName]: requestToken,
                    },
                    body: JSON.stringify({ orderId, status: nextStatus }),
                });

                if (!response.ok) return;
            }

            setOrders((prev) =>
                prev.map((o) => {
                    if (o.id !== orderId) return o;
                    return { ...o, status: nextStatus };
                }),
            );
            setSelectedOrder((prev) => {
                if (!prev || prev.id !== orderId) return prev;
                return { ...prev, status: nextStatus };
            });
        }
    }

    function viewOrderDetails(order) {
        setSelectedOrder(order);
        setShowOrderDetails(true);
    }

    function viewClientDetails(customerLabel) {
        const label = String(customerLabel || '').trim();
        if (!label) return;

        const needle = label.toLowerCase();
        const match = customers.find((c) => {
            const company = String(c?.company || '').trim().toLowerCase();
            const email = String(c?.email || '').trim().toLowerCase();
            return company === needle || email === needle;
        });

        setSelectedClient(
            match || {
                company: label,
                personInCharge: '',
                contactNo: '',
                address: '',
                companyRegNo: '',
                eInvoiceNo: '',
            },
        );
        setShowClientDetails(true);
    }

    async function updateAdminItemQty(orderId, itemName, newQty) {
        const n = Math.max(1, parseInt(newQty, 10) || 1);

        if (isAdmin) {
            const headerName = antiForgery?.headerName;
            const requestToken = antiForgery?.requestToken;
            if (!headerName || !requestToken) return;

            const response = await fetch(withBaseUrl('/Admin/UpdateOrderItemQty'), {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    [headerName]: requestToken,
                },
                body: JSON.stringify({ orderId, itemName, qty: n }),
            });

            if (!response.ok) return;
        }

        setOrders((prev) =>
            prev.map((o) => {
                if (o.id !== orderId) return o;
                if (o.status !== 'Pending') return o;
                return {
                    ...o,
                    items: o.items.map((i) => {
                        if (i.name !== itemName) return i;
                        return { ...i, qty: n };
                    }),
                };
            }),
        );
        setSelectedOrder((prev) => {
            if (!prev || prev.id !== orderId) return prev;
            return {
                ...prev,
                items: prev.items.map((i) => {
                    if (i.name !== itemName) return i;
                    const n = Math.max(1, parseInt(newQty, 10) || 1);
                    return { ...i, qty: n };
                }),
            };
        });
    }

    const customerSuggestionList = useMemo(() => {
        const q = reportFilter.custSearch.toLowerCase();
        return customers.filter((c) => c.company.toLowerCase().includes(q));
    }, [customers, reportFilter.custSearch]);

    return (
        <div className="flex flex-col min-h-screen w-full">

            <nav className="bg-white border-b border-gray-300 shadow-sm sticky top-0 z-50" style={{ backgroundColor: '#ffd700' }}>
                <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex justify-between items-center">
                    <SktopLogo size="sm" onClick={() => goToView('admin-dashboard')} />

                    <div className="hidden md:flex items-center space-x-8 text-sm font-bold uppercase tracking-tighter">

                        {isAdmin && (
                            <button onClick={() => goToView('admin-dashboard')} className="bg-red-600 text-white px-5 py-2 rounded text-xs font-black">
                                Admin Panel
                            </button>
                        )}

                        {isLoggedIn && (
                            <button onClick={logout} className="text-gray-400 text-xs font-black uppercase">
                                Logout
                            </button>
                        )}
                    </div>

                    <div className="md:hidden flex items-center">
                        <button onClick={() => setMobileMenu((v) => !v)} className="text-black focus:outline-none">
                            {!mobileMenu && (
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path>
                                </svg>
                            )}
                            {mobileMenu && (
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            )}
                        </button>
                    </div>
                </div>

                {mobileMenu && (
                    <div
                        className="md:hidden bg-white border-b border-gray-200 py-4 px-6 space-y-4 flex flex-col text-xs font-black uppercase tracking-widest"
                        style={{ backgroundColor: '#ffd700' }}
                    >
                        {isAdmin && (
                            <button
                                onClick={() => {
                                    goToView('admin-dashboard');
                                }}
                                className="text-red-600"
                            >
                                Admin Panel
                            </button>
                        )}
                        {isLoggedIn && (
                            <button
                                onClick={() => {
                                    logout();
                                    closeMobileMenu();
                                }}
                                className="text-gray-400"
                            >
                                Logout
                            </button>
                        )}
                    </div>
                )}
            </nav>




            {view === 'admin-dashboard' && (
                <main className="flex-grow py-6 md:py-12 bg-gray-100 w-full">
                    <div className="max-w-7xl mx-auto px-4 md:px-6 w-full">
                        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 w-full">
                            <h1 className="text-xl md:text-3xl font-black uppercase tracking-tighter italic underline decoration-red-600 truncate">Admin Control Center</h1>
                            <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm overflow-x-auto w-full md:w-auto">
                                {[
                                    { key: 'orders', label: 'Order Ledger' },
                                    { key: 'reports', label: 'Reports' },
                                    { key: 'inventory', label: 'Inventory Control' },
                                    { key: 'crm', label: 'Customer CRM' },
                                ].map((t) => (
                                    <button
                                        key={t.key}
                                        onClick={() => switchAdminTab(t.key)}
                                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all whitespace-nowrap ${adminTab === t.key ? 'bg-black text-white' : 'text-gray-400 hover:text-black'
                                            }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {adminBootstrapLoading && (
                            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-amber-800">
                                {adminBootstrapLoaded ? 'Refreshing tab data…' : 'Loading admin data…'}
                            </div>
                        )}

                        {adminTab === 'orders' && (
                            <section className="w-full">
                                <div className="flex justify-between items-end mb-6 w-full">
                                    <h2 className="text-[9px] font-black uppercase text-green-600 tracking-[0.2em]">Live Order Ledger</h2>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm relative w-full">
                                    <div>
                                        <label className="text-[8px] font-black uppercase text-gray-400 block mb-1 ml-1">Order Status</label>
                                        <select
                                            value={ledgerStatusFilter}
                                            onChange={(e) => setLedgerStatusFilter(e.target.value)}
                                            className="w-full border p-2.5 rounded-xl text-[10px] font-bold"
                                        >
                                            <option value="">All Statuses</option>
                                            <option value="Pending">Pending</option>
                                            <option value="Delivered">Delivered</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden w-full">
                                    <div className="overflow-x-auto w-full">
                                        <table className="w-full text-left min-w-[500px]">
                                            <thead className="bg-gray-50 border-b">
                                                <tr>
                                                    <th className="p-3 text-[9px] font-black">
                                                        <SortButton label="Order ID" sortKey="id" sort={ledgerSort} onToggle={(key) => toggleSort(setLedgerSort, key)} />
                                                    </th>
                                                    <th className="p-3 text-[9px] font-black">
                                                        <SortButton label="Order Date" sortKey="date" sort={ledgerSort} onToggle={(key) => toggleSort(setLedgerSort, key)} />
                                                    </th>
                                                    <th className="p-3 text-[9px] font-black">
                                                        <SortButton label="Client" sortKey="customer" sort={ledgerSort} onToggle={(key) => toggleSort(setLedgerSort, key)} />
                                                    </th>
                                                    <th className="p-3 text-[9px] font-black">
                                                        <SortButton label="Product Type" sortKey="productType" sort={ledgerSort} onToggle={(key) => toggleSort(setLedgerSort, key)} />
                                                    </th>
                                                    <th className="p-3 text-[9px] font-black uppercase text-gray-400">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ledgerPagination.pageItems.map((order) => {
                                                    const types = Array.from(new Set(order.items.map((i) => i.type)));
                                                    return (
                                                        <tr key={order.id} className="border-b hover:bg-gray-50 transition">
                                                            <td className="p-3 text-[11px] font-bold">{order.id}</td>
                                                            <td className="p-3 text-[11px] font-bold text-gray-500">{order.date}</td>
                                                            <td
                                                                className="p-3 text-[11px] font-bold text-blue-600 underline cursor-pointer"
                                                                onClick={() => viewClientDetails(order.customer)}
                                                            >
                                                                {order.customer}
                                                            </td>
                                                            <td className="p-3">
                                                                <div className="flex flex-wrap gap-1">
                                                                    {types.map((type) => (
                                                                        <span
                                                                            key={type}
                                                                            className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded border ${type === 'Gift'
                                                                                ? 'bg-purple-50 text-purple-600 border-purple-100'
                                                                                : 'bg-blue-50 text-blue-600 border-blue-100'
                                                                                }`}
                                                                        >
                                                                            {type}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </td>
                                                            <td className="p-3">
                                                                <div className="ledger-action-btns">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => viewOrderDetails(order)}
                                                                        className="ledger-details-btn"
                                                                    >
                                                                        Details
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        disabled={order.status === 'Delivered'}
                                                                        onClick={() => setOrderDelivered(order.id)}
                                                                        className={`ledger-deliver-btn ${order.status === 'Delivered' ? 'is-delivered' : ''}`}
                                                                    >
                                                                        <span className="ledger-deliver-label-short">
                                                                            {order.status === 'Delivered' ? 'Done' : 'Delivered'}
                                                                        </span>
                                                                        <span className="ledger-deliver-label-full">
                                                                            {order.status === 'Delivered' ? 'Delivered' : 'Set Delivered'}
                                                                        </span>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div className="px-1">
                                    <ListPagination {...ledgerPagination} label="orders" />
                                </div>
                            </section>
                        )}

                        {adminTab === 'reports' && (
                            <section className="w-full">
                                <div className="flex justify-between items-end mb-6 w-full">
                                    <h2 className="text-[9px] font-black uppercase text-red-600 tracking-[0.2em]">Annual Order Reports</h2>
                                    <button
                                        onClick={exportToExcel}
                                        className="bg-green-600 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase shadow-sm hover:bg-green-700 transition"
                                    >
                                        Export to Excel (.csv)
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm relative w-full">
                                    <div>
                                        <label className="text-[8px] font-black uppercase text-gray-400 block mb-1 ml-1">Order Year</label>
                                        <select
                                            value={reportFilter.year}
                                            onChange={(e) => setReportFilter((prev) => ({ ...prev, year: e.target.value }))}
                                            className="w-full border p-2.5 rounded-xl text-[10px] font-bold"
                                        >
                                            <option value="">All Years</option>
                                            <option value="2026">2026</option>
                                            <option value="2025">2025</option>
                                            <option value="2024">2024</option>
                                        </select>
                                    </div>

                                    <div className="relative group md:col-span-1" ref={reportSuggestionsRef}>
                                        <label className="text-[8px] font-black uppercase text-gray-400 block mb-1 ml-1">Customer Name</label>
                                        <div className="relative flex items-center">
                                            <input
                                                value={reportFilter.custSearch}
                                                onChange={(e) => setReportFilter((prev) => ({ ...prev, custSearch: e.target.value }))}
                                                onFocus={() => setReportSuggestionsOpen(true)}
                                                type="text"
                                                placeholder="Search client..."
                                                className="w-full border p-2.5 rounded-xl text-[10px] font-bold focus:ring-1 focus:ring-red-300"
                                            />
                                        </div>

                                        {reportSuggestionsOpen && (
                                            <div className="absolute left-0 mt-1 w-full bg-white border border-gray-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto">
                                                {customerSuggestionList.map((cust) => {
                                                    const selected = reportFilter.customer.includes(cust.company);
                                                    return (
                                                        <div
                                                            key={cust.id}
                                                            onClick={() => toggleCustFilter(cust.company)}
                                                            className={`p-3 border-b last:border-0 text-[11px] font-bold cursor-pointer flex justify-between items-center transition ${selected ? 'bg-red-50 text-red-700' : 'text-gray-700 hover:bg-gray-100'
                                                                }`}
                                                        >
                                                            <span>{cust.company}</span>
                                                            {selected && <span className="font-black text-xs text-red-600">✓</span>}
                                                        </div>
                                                    );
                                                })}
                                                <button
                                                    className="w-full p-2 text-[9px] font-black uppercase text-gray-400 hover:text-black"
                                                    onClick={() => setReportSuggestionsOpen(false)}
                                                    type="button"
                                                >
                                                    Close
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="text-[8px] font-black uppercase text-gray-400 block mb-1 ml-1">Order Status</label>
                                        <select
                                            value={reportFilter.status}
                                            onChange={(e) => setReportFilter((prev) => ({ ...prev, status: e.target.value }))}
                                            className="w-full border p-2.5 rounded-xl text-[10px] font-bold"
                                        >
                                            <option value="">All Statuses</option>
                                            <option value="Pending">Pending</option>
                                            <option value="Delivered">Delivered</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-[8px] font-black uppercase text-gray-400 block mb-1 ml-1">Product Type</label>
                                        <select
                                            value={reportFilter.productType}
                                            onChange={(e) => setReportFilter((prev) => ({ ...prev, productType: e.target.value }))}
                                            className="w-full border p-2.5 rounded-xl text-[10px] font-bold"
                                        >
                                            <option value="">All Types</option>
                                            <option value="Product"> Contains Product</option>
                                            <option value="Gift">Contains Gift</option>
                                        </select>
                                    </div>

                                    {reportFilter.customer.length > 0 && (
                                        <div className="md:col-span-4 mt-2 flex flex-wrap gap-2">
                                            {reportFilter.customer.map((name) => (
                                                <span key={name} className="bg-gray-100 text-[9px] font-black uppercase px-2 py-1 rounded-full flex items-center space-x-2 border border-gray-200">
                                                    <span>{name}</span>
                                                    <button onClick={() => toggleCustFilter(name)} className="text-gray-400 hover:text-red-600" type="button">
                                                        ×
                                                    </button>
                                                </span>
                                            ))}
                                            <button
                                                onClick={() => setReportFilter((prev) => ({ ...prev, customer: [] }))}
                                                className="text-[8px] font-black uppercase text-red-600 hover:underline"
                                                type="button"
                                            >
                                                Clear Selection
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="mb-4 text-center text-[10px] font-bold text-gray-400 tracking-widest uppercase bg-zinc-100 p-2 rounded-xl">
                                    Found <span className="font-black text-red-600">{filteredOrders.length}</span> matching records
                                </div>

                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden w-full">
                                    <div className="overflow-x-auto w-full">
                                        <table className="w-full text-left min-w-[750px]">
                                            <thead className="bg-gray-50 border-b">
                                                <tr>
                                                    <th className="p-4 text-[9px] font-black">
                                                        <SortButton label="Order ID" sortKey="id" sort={reportSort} onToggle={(key) => toggleSort(setReportSort, key)} />
                                                    </th>
                                                    <th className="p-4 text-[9px] font-black">
                                                        <SortButton label="Date" sortKey="date" sort={reportSort} onToggle={(key) => toggleSort(setReportSort, key)} />
                                                    </th>
                                                    <th className="p-4 text-[9px] font-black">
                                                        <SortButton label="Client" sortKey="customer" sort={reportSort} onToggle={(key) => toggleSort(setReportSort, key)} />
                                                    </th>
                                                    <th className="p-4 text-[9px] font-black">
                                                        <SortButton label="Product Type" sortKey="productType" sort={reportSort} onToggle={(key) => toggleSort(setReportSort, key)} />
                                                    </th>
                                                    <th className="p-4 text-[9px] font-black text-center">
                                                        <SortButton label="Status" sortKey="status" sort={reportSort} onToggle={(key) => toggleSort(setReportSort, key)} />
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {reportsPagination.pageItems.map((order) => {
                                                    const types = Array.from(new Set(order.items.map((i) => i.type)));
                                                    return (
                                                        <tr key={order.id} className="hover:bg-gray-50 transition">
                                                            <td
                                                                className="p-4 text-[10px] font-black text-blue-600 underline cursor-pointer"
                                                                onClick={() => viewOrderDetails(order)}
                                                            >
                                                                {order.id}
                                                            </td>
                                                            <td className="p-4 text-[10px] font-bold text-gray-600">{order.date}</td>
                                                            <td
                                                                className="p-4 text-[10px] font-black uppercase text-blue-600 underline cursor-pointer"
                                                                onClick={() => viewClientDetails(order.customer)}
                                                            >
                                                                {order.customer}
                                                            </td>
                                                            <td className="p-4">
                                                                <div className="flex flex-wrap gap-1">
                                                                    {types.map((type) => (
                                                                        <span
                                                                            key={type}
                                                                            className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded border ${type === 'Gift'
                                                                                ? 'bg-purple-50 text-purple-600 border-purple-100'
                                                                                : 'bg-blue-50 text-blue-600 border-blue-100'
                                                                                }`}
                                                                        >
                                                                            {type}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </td>
                                                            <td className="p-4 text-center">
                                                                <span
                                                                    className={`text-[8px] font-black uppercase px-2 py-1 rounded-full ${order.status === 'Pending'
                                                                        ? 'bg-amber-100 text-amber-700'
                                                                        : order.status === 'Shipped'
                                                                            ? 'bg-blue-100 text-blue-700'
                                                                            : 'bg-green-100 text-green-700'
                                                                        }`}
                                                                >
                                                                    {order.status}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div className="px-1">
                                    <ListPagination {...reportsPagination} label="records" />
                                </div>
                            </section>
                        )}

                        {adminTab === 'inventory' && (
                            <section className="w-full">
                                <h2 className="text-[9px] font-black uppercase text-red-600 mb-4 tracking-widest">Inventory & Category Control</h2>

                                <div className="mb-8 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                                    <h3 className="text-[10px] font-black uppercase mb-4">Manage Global Categories</h3>
                                    <div className="flex flex-wrap gap-4 items-end">
                                        <div className="flex-grow max-w-xs">
                                            <input
                                                value={newCategoryName}
                                                onChange={(e) => setNewCategoryName(e.target.value)}
                                                type="text"
                                                placeholder="New Category Name..."
                                                className="w-full border p-3 rounded-xl text-xs font-bold"
                                            />
                                        </div>
                                        <button onClick={addCategory} className="bg-black text-white px-6 py-3 rounded-xl font-black uppercase text-[9px]" style={{ backgroundColor: '#644117' }}>
                                            Add Category
                                        </button>

                                        <div className="flex flex-wrap gap-2 ml-4">
                                            {categories.map((cat) => (
                                                <span key={cat} className="inline-flex items-center bg-gray-100 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase">
                                                    <span>{cat}</span>
                                                    <button onClick={() => deleteCategory(cat)} className="ml-2 text-red-600 hover:text-red-800" type="button">
                                                        ✕
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid lg:grid-cols-3 gap-8">
                                    <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm h-fit">
                                        <h3 className="text-[10px] font-black uppercase mb-4">Add New Asset</h3>
                                        <form
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                addProduct();
                                            }}
                                            className="space-y-3"
                                        >
                                            <div className="space-y-2">
                                                <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Product Pictures (Max 3)</label>
                                                <input type="file" accept="image/*" multiple onChange={(e) => handleImageUpload(e, 'new')} className="w-full text-[10px]" />
                                                {Array.isArray(newProduct.images) && newProduct.images.length > 0 && (
                                                    <div className="flex gap-2 mt-2 flex-wrap">
                                                        {newProduct.images.map((img, idx) => (
                                                            <div key={`${img}-${idx}`} className="relative">
                                                                <img src={img} className="w-12 h-12 object-cover rounded border border-gray-200" />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeProductImage('new', idx)}
                                                                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-black text-white text-[10px] leading-none flex items-center justify-center"
                                                                    aria-label="Remove picture"
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Asset Type</label>
                                                <select
                                                    value={newProduct.type}
                                                    onChange={(e) => setNewProduct((prev) => ({ ...prev, type: e.target.value }))}
                                                    className="w-full border p-3 rounded-xl text-xs font-bold bg-white"
                                                    required
                                                >
                                                    <option value="Product">Product</option>
                                                    <option value="Gift">Gift</option>
                                                </select>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Category</label>
                                                <select
                                                    value={newProduct.category}
                                                    onChange={(e) => setNewProduct((prev) => ({ ...prev, category: e.target.value }))}
                                                    className="w-full border p-3 rounded-xl text-xs font-bold bg-white"
                                                    required
                                                >
                                                    <option value="" disabled>
                                                        Select Category
                                                    </option>
                                                    {categories.map((cat) => (
                                                        <option key={cat} value={cat}>
                                                            {cat}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>                                            

                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Asset Name</label>
                                                <input
                                                    value={newProduct.name}
                                                    onChange={(e) => setNewProduct((prev) => ({ ...prev, name: e.target.value }))}
                                                    type="text"
                                                    placeholder="Asset Name"
                                                    required
                                                    className="w-full border p-3 rounded-xl text-xs font-bold"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Asset Description</label>
                                                <textarea
                                                    value={newProduct.desc}
                                                    onChange={(e) => setNewProduct((prev) => ({ ...prev, desc: e.target.value }))}
                                                    placeholder="Asset Description"
                                                    className="w-full border p-3 rounded-xl text-xs font-bold"
                                                    rows={2}
                                                ></textarea>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Qty Control</label>
                                                    <select
                                                        value={newProduct.qtyControl ? 'Yes' : 'No'}
                                                        onChange={(e) =>
                                                            setNewProduct((prev) => {
                                                                const nextQtyControl = e.target.value === 'Yes';
                                                                const nextQty = nextQtyControl ? Math.max(1, parseInt(String(prev.qty), 10) || 1) : 0;
                                                                return { ...prev, qtyControl: nextQtyControl, qty: nextQty };
                                                            })
                                                        }
                                                        className="w-full border p-3 rounded-xl text-xs font-bold bg-white"
                                                        required
                                                    >
                                                        <option value="Yes">Yes</option>
                                                        <option value="No">No</option>
                                                    </select>
                                                </div>
                                                {newProduct.qtyControl ? (
                                                    <div className="space-y-1">
                                                        <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Qty</label>
                                                        <input
                                                            value={newProduct.qty ?? ''}
                                                            onChange={(e) => setNewProduct((prev) => ({ ...prev, qty: sanitizeIntegerInput(e.target.value) }))}
                                                            type="text"
                                                            inputMode="numeric"
                                                            pattern="[0-9]*"
                                                            placeholder="Qty"
                                                            required
                                                            className="w-full border p-3 rounded-xl text-xs font-bold"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div></div>
                                                )}
                                                <div className="space-y-1">
                                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Min Price</label>
                                                    <input
                                                        value={newProduct.minPrice ?? ''}
                                                        onChange={(e) => setNewProduct((prev) => ({ ...prev, minPrice: sanitizeDecimalInput(e.target.value) }))}
                                                        type="text"
                                                        inputMode="decimal"
                                                        placeholder="Min Price"
                                                        required
                                                        className="w-full border p-3 rounded-xl text-xs font-bold"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Max Price</label>
                                                    <input
                                                        value={newProduct.maxPrice ?? ''}
                                                        onChange={(e) => setNewProduct((prev) => ({ ...prev, maxPrice: sanitizeDecimalInput(e.target.value) }))}
                                                        type="text"
                                                        inputMode="decimal"
                                                        placeholder="Max Price"
                                                        required
                                                        className="w-full border p-3 rounded-xl text-xs font-bold"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Status</label>
                                                <select
                                                    value={newProduct.isActive ? 'Active' : 'Inactive'}
                                                    onChange={(e) => setNewProduct((prev) => ({ ...prev, isActive: e.target.value === 'Active' }))}
                                                    className="w-full border p-3 rounded-xl text-xs font-bold bg-white"
                                                    required
                                                >
                                                    <option value="Active">Active</option>
                                                    <option value="Inactive">Inactive</option>
                                                </select>
                                            </div>

                                            <button type="submit" className="w-full bg-black text-white py-3 rounded-xl font-black uppercase text-[9px]" style={{ backgroundColor: '#644117' }}>
                                                Add Stock Asset
                                            </button>
                                        </form>
                                    </div>

                                    <div className="lg:col-span-2 bg-white rounded-2xl border overflow-hidden shadow-sm">
                                        {productsPagination.pageItems.map((p) => (
                                            <div key={p.id} className="p-4 border-b flex flex-wrap sm:flex-nowrap justify-between items-center hover:bg-gray-50 gap-4">
                                                <div className="flex-1 min-w-0 flex items-center gap-4">
                                                    {p.images && p.images.length > 0 && <img src={p.images[0]} className="w-10 h-10 object-cover rounded border flex-shrink-0" />}
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${p.type === 'Gift' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                                {p.type}
                                                            </span>
                                                            <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${p.isActive === false ? 'bg-gray-200 text-gray-700' : 'bg-green-100 text-green-700'}`}>
                                                                {p.isActive === false ? 'Inactive' : 'Active'}
                                                            </span>
                                                            <span className="font-black uppercase text-[10px] block truncate">{p.name}</span>
                                                        </div>
                                                        <span className="text-[8px] text-gray-400 uppercase font-bold block truncate">
                                                            <span>{p.category}</span>
                                                            {p.qtyControl && (
                                                                <>
                                                                    {' | '}
                                                                    <span className={Number(p.qty) <= 0 ? 'text-red-600 font-black' : ''}>
                                                                        {Number(p.qty) <= 0 ? 'STOCK:0' : `Stock: ${p.qty}`}
                                                                    </span>
                                                                </>
                                                            )}
                                                            {` | RM ${asMoney(p.minPrice)} - ${asMoney(p.maxPrice)}`}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex space-x-2 flex-shrink-0">
                                                    <button
                                                        onClick={() => startEdit(p)}
                                                        className="px-3 py-1.5 rounded-lg text-[8px] font-black uppercase bg-white border border-blue-600 text-blue-700 hover:bg-blue-50 transition"
                                                        type="button"
                                                    >
                                                        Modify
                                                    </button>
                                                    <button
                                                        onClick={() => deleteProduct(p.id)}
                                                        className="px-3 py-1.5 rounded-lg text-[8px] font-black uppercase bg-white border border-red-600 text-red-700 hover:bg-red-50 transition"
                                                        type="button"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        <div className="px-4 pb-4">
                                            <ListPagination {...productsPagination} label="products" />
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}

                        {adminTab === 'crm' && (
                            <section className="w-full">
                                <h2 className="text-[9px] font-black uppercase text-blue-600 mb-4 tracking-widest">Customer CRM</h2>
                                <div className="grid lg:grid-cols-3 gap-8">
                                    <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm h-fit">
                                        <h3 className="text-[10px] font-black uppercase mb-4">Register New Client</h3>
                                        <form
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                createCustomer();
                                            }}
                                            className="space-y-4"
                                        >
                                            <input
                                                value={newCustomer.company}
                                                onChange={(e) => setNewCustomer((prev) => ({ ...prev, company: e.target.value }))}
                                                type="text"
                                                placeholder="Company Name"
                                                required
                                                className="w-full border p-3 rounded-xl text-xs font-bold"
                                            />
                                            <input
                                                value={newCustomer.personInCharge}
                                                onChange={(e) => setNewCustomer((prev) => ({ ...prev, personInCharge: e.target.value }))}
                                                type="text"
                                                placeholder="Person in Charge"
                                                className="w-full border p-3 rounded-xl text-xs font-bold"
                                            />
                                            <input
                                                value={newCustomer.contactNo}
                                                onChange={(e) => setNewCustomer((prev) => ({ ...prev, contactNo: e.target.value }))}
                                                type="text"
                                                inputMode="tel"
                                                placeholder="Contact No"
                                                className="w-full border p-3 rounded-xl text-xs font-bold"
                                            />
                                            <textarea
                                                value={newCustomer.address}
                                                onChange={(e) => setNewCustomer((prev) => ({ ...prev, address: e.target.value }))}
                                                placeholder="Address"
                                                rows={3}
                                                className="w-full border p-3 rounded-xl text-xs font-bold"
                                            />
                                            <input
                                                value={newCustomer.companyRegNo}
                                                onChange={(e) => setNewCustomer((prev) => ({ ...prev, companyRegNo: e.target.value }))}
                                                type="text"
                                                placeholder="Company Reg. No"
                                                className="w-full border p-3 rounded-xl text-xs font-bold"
                                            />
                                            <input
                                                value={newCustomer.eInvoiceNo}
                                                onChange={(e) => setNewCustomer((prev) => ({ ...prev, eInvoiceNo: e.target.value }))}
                                                type="text"
                                                placeholder="E-invoice No"
                                                className="w-full border p-3 rounded-xl text-xs font-bold"
                                            />
                                            <input
                                                value={newCustomer.email}
                                                onChange={(e) => setNewCustomer((prev) => ({ ...prev, email: e.target.value }))}
                                                type="email"
                                                placeholder="Email Address"
                                                required
                                                className="w-full border p-3 rounded-xl text-xs font-bold"
                                            />
                                            <input
                                                value={newCustomer.password}
                                                onChange={(e) => setNewCustomer((prev) => ({ ...prev, password: e.target.value }))}
                                                type="password"
                                                placeholder="Account Password"
                                                required
                                                className="w-full border p-3 rounded-xl text-xs font-bold"
                                            />

                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center ml-1">
                                                    <label className="text-[8px] font-black uppercase text-gray-400">Select Segments</label>
                                                    <button onClick={() => toggleAllCategories('new')} type="button" className="text-[8px] font-black uppercase text-blue-600 underline">
                                                        {newCustomer.category.length === categories.length ? 'Clear All' : 'Select All'}
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 p-3 border rounded-xl bg-white max-h-40 overflow-y-auto">
                                                    {categories.map((cat) => (
                                                        <label key={cat} className="flex items-center space-x-2 cursor-pointer group">
                                                            <input
                                                                type="checkbox"
                                                                checked={newCustomer.category.includes(cat)}
                                                                onChange={() => toggleCategory(cat, 'new')}
                                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3 h-3"
                                                            />
                                                            <span className="text-[10px] font-bold text-gray-700 group-hover:text-blue-600">{cat}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Status</label>
                                                <select
                                                    value={newCustomer.isActive ? 'Active' : 'Inactive'}
                                                    onChange={(e) => setNewCustomer((prev) => ({ ...prev, isActive: e.target.value === 'Active' }))}
                                                    className="w-full border p-3 rounded-xl text-xs font-bold bg-white"
                                                    required
                                                >
                                                    <option value="Active">Active</option>
                                                    <option value="Inactive">Inactive</option>
                                                </select>
                                            </div>

                                            <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-[9px]" style={{ backgroundColor: '#644117' }}>
                                                Register Profile
                                            </button>
                                        </form>
                                    </div>

                                    <div className="lg:col-span-2 bg-white rounded-2xl border overflow-hidden shadow-sm">
                                        {customersPagination.pageItems.map((c) => {
                                            const cats = Array.isArray(c.category) ? c.category : [c.category];
                                            return (
                                                <div key={c.id} className="p-4 border-b flex flex-wrap sm:flex-nowrap justify-between items-center hover:bg-gray-50 gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <span className="font-black uppercase text-[10px] block truncate">{c.company}</span>
                                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                                            <span className="text-[8px] text-gray-400 font-bold truncate">{c.email}</span>
                                                            {(c.personInCharge || c.contactNo) && (
                                                                <span className="text-[8px] text-gray-500 font-bold truncate">
                                                                    {[c.personInCharge, c.contactNo].filter(Boolean).join(' · ')}
                                                                </span>
                                                            )}
                                                            <span className={`text-[7px] font-black uppercase px-2 py-0.5 rounded ${c.isActive === false ? 'bg-gray-200 text-gray-700' : 'bg-green-100 text-green-700'}`}>
                                                                {c.isActive === false ? 'Inactive' : 'Active'}
                                                            </span>
                                                            {cats.map((cat) => (
                                                                <span key={cat} className="text-[7px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-black uppercase">
                                                                    {cat}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className="flex space-x-2">
                                                        <button
                                                            onClick={() => startCustomerEdit(c)}
                                                            className="px-3 py-1.5 rounded-lg text-[8px] font-black uppercase bg-white border border-blue-600 text-blue-700 hover:bg-blue-50 transition"
                                                            type="button"
                                                        >
                                                            Modify
                                                        </button>
                                                        <button
                                                            onClick={() => deleteCustomer(c.id)}
                                                            className="px-3 py-1.5 rounded-lg text-[8px] font-black uppercase bg-white border border-red-600 text-red-700 hover:bg-red-50 transition"
                                                            type="button"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <div className="px-4 pb-4">
                                            <ListPagination {...customersPagination} label="customers" />
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>
                </main>
            )}




            {(editMode || customerEditMode || showOrderDetails || showClientDetails) && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
                    {showClientDetails && selectedClient && (
                        <div className="bg-white w-full max-w-sm rounded-2xl p-6 md:p-8 overflow-y-auto max-h-[85vh]">
                            <div className="flex justify-between items-start mb-6">
                                <h2 className="font-black uppercase text-base italic">Client Details</h2>
                                <button
                                    onClick={() => {
                                        setShowClientDetails(false);
                                        setSelectedClient(null);
                                    }}
                                    className="text-2xl leading-none"
                                    type="button"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="space-y-4">
                                {[
                                    { label: 'Company Name', value: selectedClient.company },
                                    { label: 'Person In Charge', value: selectedClient.personInCharge },
                                    { label: 'Contact No', value: selectedClient.contactNo },
                                    { label: 'Address', value: selectedClient.address },
                                    { label: 'Company Reg. No', value: selectedClient.companyRegNo },
                                    { label: 'E-Invoice No', value: selectedClient.eInvoiceNo },
                                ].map((field) => (
                                    <div key={field.label} className="space-y-1 border-b border-gray-50 pb-3">
                                        <div className="text-[8px] font-black uppercase text-gray-400 ml-1">{field.label}</div>
                                        <div className="text-[11px] font-bold text-gray-800 whitespace-pre-wrap break-words">
                                            {field.value || '—'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {showOrderDetails && selectedOrder && (
                        <div className="bg-white w-full max-w-md rounded-2xl p-6 md:p-8 overflow-y-auto max-h-[85vh]">
                            <div className="flex justify-between items-start mb-6 font-black uppercase">
                                <div className="flex flex-col">
                                    <h2 className="text-base">{selectedOrder.id}</h2>
                                    <span className="text-[10px] text-gray-400">{`Status: ${selectedOrder.status}`}</span>
                                </div>
                                <button onClick={() => setShowOrderDetails(false)} className="text-2xl leading-none" type="button">
                                    ×
                                </button>
                            </div>

                            <div className="space-y-4 border-t pt-4">
                                {selectedOrder.items.map((item) => (
                                    <div key={item.name} className="flex justify-between items-center text-[10px] font-bold uppercase border-b pb-3 border-gray-50">
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-[6px] font-black uppercase px-1 py-0.5 rounded ${item.type === 'Gift' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {item.type}
                                                </span>
                                                <span>{item.name}</span>
                                            </div>
                                            <span className="text-[8px] text-gray-400 italic">{`Range: RM${asMoney(item.minPrice)} - ${asMoney(item.maxPrice)}`}</span>
                                        </div>
                                        <div className="flex items-center space-x-6">
                                            <div className="flex flex-col items-center">
                                                <span className="text-[7px] text-gray-400 mb-0.5">Quantity</span>
                                                {(adminTab === 'orders' && selectedOrder.status === 'Pending') ? (
                                                    <input
                                                        type="number"
                                                        value={item.qty}
                                                        onChange={(e) => updateAdminItemQty(selectedOrder.id, item.name, e.target.value)}
                                                        className="w-12 border rounded text-center font-black text-sm bg-gray-50"
                                                    />
                                                ) : (
                                                    <span className="font-black text-sm">{item.qty}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {(adminTab === 'orders' && selectedOrder.status === 'Pending') && (
                                    <div className="bg-blue-50 p-3 rounded-lg border border-dashed border-blue-200 mt-4">
                                        <p className="text-[8px] text-blue-600 uppercase text-center font-black">
                                            Admin Mode: Quantities updated here will reflect in the ledger immediately.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {editMode && editingProduct && (
                        <div
                            className="bg-white w-full max-w-sm rounded-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh]"
                            onClick={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                        >
                            <h2 className="font-black uppercase mb-6 text-base italic">Modify Asset</h2>
                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Update Pictures (Max 3)</label>
                                    <input type="file" accept="image/*" multiple onChange={(e) => handleImageUpload(e, 'edit')} className="w-full text-[10px]" />

                                    <div className="flex gap-2 mt-2 flex-wrap">
                                        {editingProduct.images.map((img, idx) => (
                                            <div key={`${img}-${idx}`} className="relative">
                                                <img src={img} className="w-12 h-12 object-cover rounded border border-gray-200" />
                                                <button
                                                    type="button"
                                                    onClick={() => removeProductImage('edit', idx)}
                                                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-black text-white text-[10px] leading-none flex items-center justify-center"
                                                    aria-label="Remove picture"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Asset Type</label>
                                    <select
                                        value={editingProduct.type}
                                        onChange={(e) => setEditingProduct((prev) => ({ ...prev, type: e.target.value }))}
                                        className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                        required
                                    >
                                        <option value="Product">Product</option>
                                        <option value="Gift">Gift</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Category</label>
                                    <select
                                        value={editingProduct.category}
                                        onChange={(e) => setEditingProduct((prev) => ({ ...prev, category: e.target.value }))}
                                        className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                        required
                                    >
                                        <option value="" disabled>
                                            Select Category
                                        </option>
                                        {categories.map((cat) => (
                                            <option key={cat} value={cat}>
                                                {cat}
                                            </option>
                                        ))}
                                    </select>
                                </div>                                

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Asset Name</label>
                                    <input
                                        value={editingProduct.name}
                                        onChange={(e) => setEditingProduct((prev) => ({ ...prev, name: e.target.value }))}
                                        className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                        required
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Asset Description</label>
                                    <textarea
                                        value={editingProduct.desc}
                                        onChange={(e) => setEditingProduct((prev) => ({ ...prev, desc: e.target.value }))}
                                        className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                        rows={2}
                                    ></textarea>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Qty Control</label>
                                        <select
                                            value={editingProduct.qtyControl ? 'Yes' : 'No'}
                                            onChange={(e) =>
                                                setEditingProduct((prev) => {
                                                    if (!prev) return prev;
                                                    const nextQtyControl = e.target.value === 'Yes';
                                                    const nextQty = nextQtyControl ? Math.max(1, parseInt(String(prev.qty), 10) || 1) : 0;
                                                    return { ...prev, qtyControl: nextQtyControl, qty: nextQty };
                                                })
                                            }
                                            className="w-full border p-3 rounded-xl text-[11px] font-bold bg-white"
                                            required
                                        >
                                            <option value="Yes">Yes</option>
                                            <option value="No">No</option>
                                        </select>
                                    </div>
                                    {editingProduct.qtyControl ? (
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Qty</label>
                                            <input
                                                value={editingProduct.qty ?? ''}
                                                onChange={(e) =>
                                                    setEditingProduct((prev) => (prev ? { ...prev, qty: sanitizeIntegerInput(e.target.value) } : prev))
                                                }
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                placeholder="Qty"
                                                className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                                required
                                            />
                                        </div>
                                    ) : (
                                        <div></div>
                                    )}
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Min Price</label>
                                        <input
                                            value={editingProduct.minPrice ?? ''}
                                            onChange={(e) =>
                                                setEditingProduct((prev) => (prev ? { ...prev, minPrice: sanitizeDecimalInput(e.target.value) } : prev))
                                            }
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="Min Price"
                                            className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Max Price</label>
                                        <input
                                            value={editingProduct.maxPrice ?? ''}
                                            onChange={(e) =>
                                                setEditingProduct((prev) => (prev ? { ...prev, maxPrice: sanitizeDecimalInput(e.target.value) } : prev))
                                            }
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="Max Price"
                                            className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Status</label>
                                    <select
                                        value={editingProduct.isActive ? 'Active' : 'Inactive'}
                                        onChange={(e) => setEditingProduct((prev) => ({ ...prev, isActive: e.target.value === 'Active' }))}
                                        className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                        required
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Inactive">Inactive</option>
                                    </select>
                                </div>

                                <div className="flex space-x-2 pt-4">
                                    <button onClick={() => setEditMode(false)} className="flex-1 bg-gray-100 py-3 rounded-xl font-black text-[9px]" type="button">
                                        Cancel
                                    </button>
                                    <button onClick={saveEdit} className="flex-1 bg-black text-white py-3 rounded-xl font-black text-[9px]" style={{ backgroundColor: '#644117' }} type="button">
                                        Update
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {customerEditMode && editingCustomer && (
                        <div
                            className="bg-white w-full max-w-sm rounded-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh]"
                            onClick={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                        >
                            <h2 className="font-black uppercase mb-6 text-base italic">Modify Client Profile</h2>
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Company</label>
                                    <input
                                        value={editingCustomer.company}
                                        onChange={(e) => setEditingCustomer((prev) => ({ ...prev, company: e.target.value }))}
                                        className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Person in Charge</label>
                                    <input
                                        value={editingCustomer.personInCharge || ''}
                                        onChange={(e) => setEditingCustomer((prev) => ({ ...prev, personInCharge: e.target.value }))}
                                        className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Contact No</label>
                                    <input
                                        value={editingCustomer.contactNo || ''}
                                        onChange={(e) => setEditingCustomer((prev) => ({ ...prev, contactNo: e.target.value }))}
                                        type="text"
                                        inputMode="tel"
                                        className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Address</label>
                                    <textarea
                                        value={editingCustomer.address || ''}
                                        onChange={(e) => setEditingCustomer((prev) => ({ ...prev, address: e.target.value }))}
                                        rows={3}
                                        className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Company Reg. No</label>
                                    <input
                                        value={editingCustomer.companyRegNo || ''}
                                        onChange={(e) => setEditingCustomer((prev) => ({ ...prev, companyRegNo: e.target.value }))}
                                        className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">E-invoice No</label>
                                    <input
                                        value={editingCustomer.eInvoiceNo || ''}
                                        onChange={(e) => setEditingCustomer((prev) => ({ ...prev, eInvoiceNo: e.target.value }))}
                                        className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Email Address</label>
                                    <input
                                        value={editingCustomer.email}
                                        onChange={(e) => setEditingCustomer((prev) => ({ ...prev, email: e.target.value }))}
                                        type="email"
                                        className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Security Password</label>
                                    <input
                                        value={editingCustomer.password}
                                        onChange={(e) => setEditingCustomer((prev) => ({ ...prev, password: e.target.value }))}
                                        type="text"
                                        className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                    />
                                </div>                                

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center ml-1">
                                        <label className="text-[8px] font-black uppercase text-gray-400">Assigned Catalogs</label>
                                        <button onClick={() => toggleAllCategories('edit')} type="button" className="text-[8px] font-black uppercase text-blue-600 underline">
                                            {editingCustomer.category.length === categories.length ? 'Clear All' : 'Select All'}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 p-3 border rounded-xl bg-gray-50 max-h-40 overflow-y-auto">
                                        {categories.map((cat) => (
                                            <label key={cat} className="flex items-center space-x-2 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={editingCustomer.category.includes(cat)}
                                                    onChange={() => toggleCategory(cat, 'edit')}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3 h-3"
                                                />
                                                <span className="text-[10px] font-bold text-gray-700 group-hover:text-blue-600">{cat}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-gray-400 ml-1">Status</label>
                                    <select
                                        value={editingCustomer.isActive ? 'Active' : 'Inactive'}
                                        onChange={(e) => setEditingCustomer((prev) => ({ ...prev, isActive: e.target.value === 'Active' }))}
                                        className="w-full border p-3 rounded-xl text-[11px] font-bold"
                                        required
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Inactive">Inactive</option>
                                    </select>
                                </div>

                                <div className="flex space-x-2 pt-4">
                                    <button onClick={() => setCustomerEditMode(false)} className="flex-1 bg-gray-100 py-3 rounded-xl font-black text-[9px]" type="button">
                                        Cancel
                                    </button>
                                    <button onClick={saveCustomerEdit} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black text-[9px]" style={{ backgroundColor: '#644117' }} type="button">
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <footer className="py-10 text-center text-[8px] md:text-[10px] uppercase tracking-[0.3em] mt-auto px-4" style={{ backgroundColor: '#ffd700' }}>
                © 2026 SKTOP Management Terminal | All Rights Reserved.
            </footer>
        </div>
    );
}
