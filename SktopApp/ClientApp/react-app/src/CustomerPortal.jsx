import React, { useEffect, useMemo, useState } from 'react';
import { asMoney } from './utils.js';
import { useResponsivePagination } from './useResponsivePagination.js';
import ListPagination from './ListPagination.jsx';
import SktopLogo from './SktopLogo.jsx';

const COMPANY_NAME = 'SKTOP Enterprise Sdn Bhd';

const CONTACT_PERSONS = [
    { name: 'Robin Chin', phone: '012-691 0018', wa: '60126910018' },
    { name: 'Guan', phone: '016-221 6066', wa: '60162216066' },
    { name: 'James', phone: '012-218 6023', wa: '60122186023' },
    { name: 'Jun', phone: '012-389 0236', wa: '60123890236' },
];

const BUSINESS_HOURS = [
    { day: 'Monday–Friday', time: '9AM–5.30PM' },
    { day: 'Saturday', time: '9AM–12PM' },
];

const WHATSAPP_INQUIRY_TEXT = 'Hi SKTOP, I have a general inquiry about your services.';

export default function CustomerPortal(props) {
    const cartStorageKey = 'sktop_cart_v1';
    const baseUrl = (() => {
        const raw = typeof props?.baseUrl === 'string' ? props.baseUrl : '/';
        const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
        return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
    })();

    const withBaseUrl = (path) => {
        const trimmed = typeof path === 'string' ? path : '';
        return `${baseUrl}${trimmed.replace(/^\/+/, '')}`;
    };

    const imageBaseUrl = props?.imageBaseUrl || '/images/';
    const auth = props?.auth || {};
    const antiForgery = props?.antiForgery || {};
    const loginError = props?.loginError || '';

    const resolvedInitialView = (() => {
        const allowedViews = new Set([
            'home',
            'contact',
            'about',
            'store',
            'cart',
            'history',
            'login',
        ]);

        const queryView =
            typeof window !== 'undefined'
                ? new URLSearchParams(window.location.search).get('view')
                : null;

        const requested = props?.initialView || (allowedViews.has(queryView || '') ? queryView : null) || 'home';
        if (requested === 'login' && Boolean(auth?.isAuthenticated)) {
            return 'home';
        }
        if (requested === 'about') return 'contact';
        return requested;
    })();

    const isAuthHostPage = props?.initialView === 'login';

    const [view, setView] = useState(resolvedInitialView);
    const [showWhatsAppPicker, setShowWhatsAppPicker] = useState(false);
    const [mobileMenu, setMobileMenu] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(Boolean(auth?.isAuthenticated));
    const [showOrderDetails, setShowOrderDetails] = useState(false);

    const [selectedOrder, setSelectedOrder] = useState(null);
    const currentUser = auth?.email || null;

    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedAssetType, setSelectedAssetType] = useState('Product');
    const [productSearch, setProductSearch] = useState('');

    const normalizeAvailableSegments = (raw) => {
        const empty = { Product: [], Gift: [] };
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
        const toList = (value) =>
            Array.isArray(value)
                ? value.filter((c) => typeof c === 'string' && c.trim() !== '')
                : [];
        return {
            Product: toList(raw.Product ?? raw.product),
            Gift: toList(raw.Gift ?? raw.gift),
        };
    };

    const [products, setProducts] = useState(() => {
        const initialProducts = props?.initialProducts;
        return Array.isArray(initialProducts) ? initialProducts : [];
    });

    const [availableSegments, setAvailableSegments] = useState(() =>
        normalizeAvailableSegments(props?.availableSegments)
    );
    const [availableSegmentsLoaded, setAvailableSegmentsLoaded] = useState(
        () => props?.availableSegments != null && typeof props.availableSegments === 'object'
    );

    const [orders, setOrders] = useState(() => {
        const initialOrders = props?.initialOrders;
        return Array.isArray(initialOrders) ? initialOrders : [];
    });

    const [cart, setCart] = useState(() => {
        if (typeof window === 'undefined') return [];
        try {
            const raw = window.localStorage.getItem(cartStorageKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((i) => i && (typeof i.id === 'number' || typeof i.id === 'string') && typeof i.name === 'string')
                .map((i) => ({
                    ...i,
                    cartQty: Math.max(1, parseInt(String(i.cartQty ?? 1), 10) || 1),
                }));
        } catch {
            try {
                window.localStorage.removeItem(cartStorageKey);
            } catch { }
            return [];
        }
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            if (!cart || cart.length === 0) {
                window.localStorage.removeItem(cartStorageKey);
                return;
            }
            window.localStorage.setItem(cartStorageKey, JSON.stringify(cart));
        } catch { }
    }, [cart]);

    useEffect(() => {
        if (!cart || cart.length === 0) return;
        if (!products || products.length === 0) return;

        setCart((prev) => {
            if (!prev || prev.length === 0) return prev;
            const next = prev.filter((item) => {
                const id = item?.id;
                const product = products.find((p) => p?.id === id);
                if (!product) return true;
                if (product.qtyControl && Number(product.qty) <= 0) return false;
                return true;
            });
            return next.length === prev.length ? prev : next;
        });
    }, [products, cart.length]);

    function closeMobileMenu() {
        setMobileMenu(false);
    }

    function goToView(nextView) {
        if (isAuthHostPage) {
            const url = nextView === 'home' ? baseUrl : `${baseUrl}?view=${encodeURIComponent(nextView)}`;
            window.location.assign(url);
            return;
        }

        setView(nextView);
        closeMobileMenu();
    }

    async function refreshCatalog() {
        const [catalogResponse, segmentsResponse] = await Promise.all([
            fetch(withBaseUrl('/Home/Catalog'), { credentials: 'same-origin' }).catch(() => null),
            fetch(withBaseUrl('/Home/AvailableSegments'), { credentials: 'same-origin' }).catch(() => null),
        ]);

        if (catalogResponse?.ok) {
            const data = await catalogResponse.json().catch(() => null);
            if (Array.isArray(data)) {
                setProducts(data);
            }
        }

        if (segmentsResponse?.ok) {
            const segments = await segmentsResponse.json().catch(() => null);
            setAvailableSegments(normalizeAvailableSegments(segments));
            setAvailableSegmentsLoaded(true);
        }
    }

    async function refreshOrderHistory() {
        const response = await fetch(withBaseUrl('/Orders/My'), { credentials: 'same-origin' }).catch(() => null);
        if (!response || !response.ok) return;
        const data = await response.json().catch(() => null);
        if (!Array.isArray(data)) return;
        setOrders(data);
    }

    useEffect(() => {
        if (view === 'store') {
            refreshCatalog();
            return;
        }
        if (view === 'history' && isLoggedIn) {
            refreshOrderHistory();
        }
    }, [isLoggedIn, view]);

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

    function redirectToLogin() {
        window.location.assign(withBaseUrl('/Account/Login'));
    }

    function addToCart(product) {
        if (product?.qtyControl && Number(product?.qty) <= 0) {
            alert('OUT OF STOCK');
            return;
        }
        setCart((prev) => {
            const existing = prev.find((item) => item.id === product.id);
            if (existing) {
                return prev.map((item) => (item.id === product.id ? { ...item, cartQty: item.cartQty + 1 } : item));
            }
            return [...prev, { ...product, cartQty: 1 }];
        });
        alert(`${product.name} added to orders.`);
    }

    function findCatalogProduct(orderItem) {
        const name = String(orderItem?.name || '').trim().toLowerCase();
        const type = String(orderItem?.type || '').trim().toLowerCase();
        const category = String(orderItem?.category || '').trim().toLowerCase();
        if (!name) return null;

        return (
            products.find((p) => {
                const pName = String(p?.name || '').trim().toLowerCase();
                const pType = String(p?.type || '').trim().toLowerCase();
                const pCategory = String(p?.category || '').trim().toLowerCase();
                if (pName !== name) return false;
                if (type && pType !== type) return false;
                if (category && pCategory !== category) return false;
                return true;
            }) || null
        );
    }

    function addOrderItemsToCart(order) {
        if (!isLoggedIn) {
            redirectToLogin();
            return;
        }

        const items = Array.isArray(order?.items) ? order.items : [];
        if (items.length === 0) {
            alert('No items found for this order.');
            return;
        }

        const additions = [];
        const skipped = [];

        items.forEach((orderItem) => {
            const product = findCatalogProduct(orderItem);
            const qty = Math.max(1, parseInt(String(orderItem?.qty ?? 1), 10) || 1);
            const label = orderItem?.name || 'Item';

            if (!product) {
                skipped.push(`${label} (unavailable)`);
                return;
            }

            const isActive = typeof product.isActive === 'boolean' ? product.isActive : true;
            if (!isActive) {
                skipped.push(`${label} (inactive)`);
                return;
            }

            if (product.qtyControl && Number(product.qty) <= 0) {
                skipped.push(`${label} (out of stock)`);
                return;
            }

            additions.push({ product, qty });
        });

        if (additions.length === 0) {
            alert(
                skipped.length > 0
                    ? `Could not add items to cart:\n${skipped.join('\n')}`
                    : 'No matching catalog items found for this order.',
            );
            return;
        }

        setCart((prev) => {
            let next = [...prev];
            additions.forEach(({ product, qty }) => {
                const existing = next.find((item) => item.id === product.id);
                if (existing) {
                    next = next.map((item) =>
                        item.id === product.id ? { ...item, cartQty: item.cartQty + qty } : item,
                    );
                } else {
                    next = [...next, { ...product, cartQty: qty }];
                }
            });
            return next;
        });

        const addedNames = additions.map(({ product, qty }) => `${product.name} (x${qty})`);
        let message = `Added to cart:\n${addedNames.join('\n')}`;
        if (skipped.length > 0) {
            message += `\n\nSkipped:\n${skipped.join('\n')}`;
        }
        alert(message);
    }

    function removeFromCart(id) {
        setCart((prev) => prev.filter((item) => item.id !== id));
    }

    async function submitOrder() {
        if (cart.length === 0) return;
        if (!isLoggedIn) {
            redirectToLogin();
            return;
        }

        const outOfStockItem = cart.find((i) => i?.qtyControl && Number(i?.qty) <= 0);
        if (outOfStockItem) {
            alert(`OUT OF STOCK: ${outOfStockItem.name}`);
            return;
        }

        const headerName = antiForgery?.headerName;
        const requestToken = antiForgery?.requestToken;
        if (!headerName || !requestToken) {
            redirectToLogin();
            return;
        }

        const items = cart.map((i) => ({
            name: i.name,
            type: i.type,
            category: i.category,
            qty: i.cartQty,
            minPrice: i.minPrice,
            maxPrice: i.maxPrice,
        }));

        const response = await fetch(withBaseUrl('/Orders/Create'), {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                [headerName]: requestToken,
            },
            body: JSON.stringify({ items }),
        });

        if (!response.ok) {
            const errorJson = await response.json().catch(() => null);
            const errorText = errorJson?.error || (await response.text().catch(() => ''));
            alert(errorText || 'Unable to submit order.');
            if (typeof window !== 'undefined') window.location.reload();
            return;
        }

        const data = await response.json().catch(() => ({}));
        const orderNumber = data?.orderNumber || `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
        const today = new Date().toISOString().split('T')[0];
        const newOrder = {
            id: orderNumber,
            customer: auth?.email || currentUser,
            status: 'Pending',
            date: today,
            items,
        };

        setOrders((prev) => [...prev, newOrder]);
        setCart([]);
        setView('history');
        alert(`Order ${newOrder.id} submitted.`);
    }

    function viewOrderDetails(order) {
        setSelectedOrder(order);
        setShowOrderDetails(true);
    }

    const hasUserCategoriesProp = Array.isArray(props?.userCategories);
    const userCategories = hasUserCategoriesProp ? props.userCategories : [];
    const permittedCategories = useMemo(() => {
        const typeKey = selectedAssetType === 'Gift' ? 'Gift' : 'Product';
        const fromSp = availableSegments?.[typeKey];

        // Prefer SP-backed available segments for the active Products/Gifts tab.
        // Fallback: distinct categories from loaded catalog rows of that type.
        const availableForType = availableSegmentsLoaded && Array.isArray(fromSp)
            ? fromSp
            : Array.from(
                  new Set(
                      products
                          .filter((p) => {
                              const isProductActive = typeof p?.isActive === 'boolean' ? p.isActive : true;
                              return (
                                  isProductActive &&
                                  p?.type === selectedAssetType &&
                                  typeof p?.category === 'string' &&
                                  p.category.trim() !== ''
                              );
                          })
                          .map((p) => p.category)
                  )
              ).sort();

        if (isLoggedIn && hasUserCategoriesProp) {
            return availableForType.filter((c) => userCategories.includes(c));
        }
        return availableForType;
    }, [
        availableSegments,
        availableSegmentsLoaded,
        hasUserCategoriesProp,
        isLoggedIn,
        products,
        selectedAssetType,
        userCategories,
    ]);

    useEffect(() => {
        if (selectedCategory === 'All') return;
        if (permittedCategories.includes(selectedCategory)) return;
        setSelectedCategory('All');
    }, [permittedCategories, selectedCategory]);

    function selectAssetType(nextType) {
        setSelectedAssetType(nextType);
        setSelectedCategory('All');
    }

    const storeProducts = useMemo(() => {
        const q = productSearch.trim().toLowerCase();
        return products.filter((p) => {
            const isProductActive = typeof p?.isActive === 'boolean' ? p.isActive : true;
            if (!isProductActive) return false;
            const matchesSelectedCat = selectedCategory === 'All' || p.category === selectedCategory;
            const matchesAssetType = p.type === selectedAssetType;
            const matchesSearch = q === '' || String(p?.name || '').toLowerCase().includes(q);
            let matchesPermission = true;
            if (isLoggedIn) {
                if (hasUserCategoriesProp) {
                    matchesPermission = userCategories.includes(p.category);
                } else {
                    matchesPermission = false;
                }
            }
            return matchesSelectedCat && matchesAssetType && matchesSearch && matchesPermission;
        });
    }, [hasUserCategoriesProp, isLoggedIn, productSearch, products, selectedAssetType, selectedCategory, userCategories]);

    const catalogResetKey = `${selectedAssetType}|${selectedCategory}|${productSearch}`;
    const catalogPagination = useResponsivePagination(storeProducts, catalogResetKey);
    const ordersPagination = useResponsivePagination(orders, `orders:${orders.length}`);


    return (
        <div className="flex flex-col min-h-[100dvh] w-full max-w-[100vw] overflow-x-hidden">
            <div className="fixed bottom-24 right-6 z-[100]">
                    <button
                        type="button"
                        onClick={() => setShowWhatsAppPicker(true)}
                        className="whatsapp-float bg-[#25D366] text-white w-14 h-14 rounded-full flex items-center justify-center shadow-2xl"
                        aria-label="Contact us on WhatsApp"
                    >
                        <i className="fab fa-whatsapp text-3xl"></i>
                    </button>
                </div>

            <nav className="bg-white border-b border-gray-300 shadow-sm sticky top-0 z-50 w-full max-w-[100vw] overflow-x-hidden" style={{ backgroundColor: '#ffd700' }}>
                <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex justify-between items-center gap-3 min-w-0">
                    <SktopLogo size="sm" className="min-w-0 shrink" onClick={() => goToView('home')} />

                    <div className="hidden md:flex items-center space-x-8 text-sm font-bold uppercase tracking-tighter">
                        <button onClick={() => goToView('home')} className={view === 'home' ? 'text-black underline' : 'text-gray-400 hover:text-black'}>
                                    Home
                                </button>
                                <button onClick={() => goToView('contact')} className={view === 'contact' ? 'text-black underline' : 'text-gray-400 hover:text-black'}>
                                    Contact Us
                                </button>
                                <button
                                    onClick={() => {
                                        selectAssetType('Product');
                                        goToView('store');
                                    }}
                                    className={view === 'store' && selectedAssetType === 'Product' ? 'text-black underline' : 'text-gray-400 hover:text-black'}
                                >
                                    Products
                                </button>
                                <button
                                    onClick={() => {
                                        selectAssetType('Gift');
                                        goToView('store');
                                    }}
                                    className={view === 'store' && selectedAssetType === 'Gift' ? 'text-black underline' : 'text-gray-400 hover:text-black'}
                                >
                                    Gifts
                                </button>
                                {isLoggedIn && (
                                    <button onClick={() => goToView('history')} className={view === 'history' ? 'text-black underline' : 'text-gray-400 hover:text-black'}>
                                        Orders
                                    </button>
                                )}


                        {!isLoggedIn && (
                            <button
                                onClick={redirectToLogin}
                                className="text-white px-5 py-2 rounded text-xs font-black"
                                style={{ backgroundColor: '#644117' }}
                            >
                                Login
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
                        <button onClick={() => goToView('home')}>Home</button>
                                <button onClick={() => goToView('contact')}>Contact Us</button>
                                <button
                                    onClick={() => {
                                        selectAssetType('Product');
                                        goToView('store');
                                    }}
                                >
                                    Products
                                </button>
                                <button
                                    onClick={() => {
                                        selectAssetType('Gift');
                                        goToView('store');
                                    }}
                                >
                                    Gifts
                                </button>
                                {isLoggedIn && <button onClick={() => goToView('history')}>Orders</button>}
                        {!isLoggedIn && (
                            <button onClick={redirectToLogin} className="bg-black text-white py-3 rounded text-center">
                                Login
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

            {view === 'home' && (
                <main className="customer-home flex-1 flex items-center justify-center relative min-h-0 md:min-h-[500px]" style={{ backgroundColor: '#E5E1E6' }}>
                    <div className="absolute inset-0 hero-overlay z-10"></div>
                    <img src={`${imageBaseUrl}carBanner2.jpg`} className="absolute inset-0 w-full h-full object-cover opacity-40" />
                    <div className="relative z-20 text-center px-4 py-4">
                        <div className="mb-4 md:mb-8 flex justify-center">
                            <SktopLogo size="lg" />
                        </div>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 md:gap-4">
                            <button
                                onClick={() => {
                                    selectAssetType('Product');
                                    goToView('store');
                                }}
                                className="text-white px-8 md:px-12 py-3 md:py-5 font-black uppercase text-[10px] md:text-xs tracking-widest hover:opacity-90 transition"
                                style={{ backgroundColor: '#644117' }}
                            >
                                Enter Products
                            </button>
                            <button
                                onClick={() => {
                                    selectAssetType('Gift');
                                    goToView('store');
                                }}
                                className="text-white px-8 md:px-12 py-3 md:py-5 font-black uppercase text-[10px] md:text-xs tracking-widest hover:opacity-90 transition"
                                style={{ backgroundColor: '#644117' }}
                            >
                                Enter Gifts
                            </button>
                        </div>
                    </div>
                </main>
            )}

            {view === 'contact' && (
                <main className="contact-page flex-grow w-full">
                    <section className="contact-hero relative overflow-hidden">
                        <div className="contact-hero-glow" aria-hidden="true" />
                        <div className="relative z-10 max-w-5xl mx-auto px-6 py-10 md:py-14">
                            <p className="text-sm md:text-base font-black uppercase tracking-[0.25em] mb-3" style={{ color: '#644117' }}>
                                Contact Us
                            </p>
                            <h1 className="contact-hero-title text-3xl md:text-5xl font-black uppercase tracking-tighter italic leading-none mb-5" style={{ color: '#644117' }}>
                                SKTOP Enterprise<br className="hidden sm:block" /> Sdn Bhd
                            </h1>
                            <ul className="contact-hero-points max-w-2xl space-y-2.5 text-gray-700 text-xs md:text-sm leading-relaxed font-medium">
                                <li className="flex gap-3">
                                    <i className="fas fa-car mt-0.5 shrink-0" style={{ color: '#644117' }} aria-hidden="true" />
                                    <span>Wholesale and retail sale of all kinds of high quality parts, components, supplies, tools and accessories for motor vehicles</span>
                                </li>
                                <li className="flex gap-3">
                                    <i className="fas fa-gift mt-0.5 shrink-0" style={{ color: '#644117' }} aria-hidden="true" />
                                    <span>Wholesale premium door gift and souvenir</span>
                                </li>
                            </ul>
                        </div>
                    </section>

                    <div className="max-w-5xl mx-auto px-6 py-8 md:py-12 space-y-6 md:space-y-8">
                        <div className="contact-reg-strip grid grid-cols-1 sm:grid-cols-3 gap-px overflow-hidden rounded-2xl border border-amber-200/80">
                            {[
                                { label: 'SSM No', value: '1080880M' },
                                { label: 'TIN No', value: 'C23163690030' },
                                { label: 'MSIC Code', value: '45300' },
                            ].map((item) => (
                                <div key={item.label} className="contact-reg-item bg-white px-5 py-4 text-center sm:text-left">
                                    <span className="block text-[8px] font-black uppercase tracking-[0.25em] text-gray-400 mb-1">{item.label}</span>
                                    <span className="text-sm md:text-base font-black tracking-tight" style={{ color: '#644117' }}>{item.value}</span>
                                </div>
                            ))}
                        </div>

                        <div className="grid lg:grid-cols-5 gap-6 md:gap-8">
                            <div className="lg:col-span-3 space-y-6">
                                <section className="contact-panel">
                                    <div className="flex items-start gap-4">
                                        <span className="contact-panel-icon" aria-hidden="true">
                                            <i className="fas fa-map-marker-alt" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <h2 className="text-[9px] font-black uppercase tracking-[0.25em] text-gray-400 mb-2">Address</h2>
                                            <p className="text-sm md:text-base font-bold text-gray-900 leading-relaxed mb-5">
                                                13, Jalan 23, Taman Bukit Kuchai,<br />
                                                47190, Puchong, Selangor.
                                            </p>
                                            <a
                                                href="https://waze.com/ul/hw2832ud64"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="contact-waze-btn inline-flex items-center gap-2.5 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition"
                                            >
                                                <i className="fas fa-location-arrow" aria-hidden="true" />
                                                Drive with Waze
                                            </a>
                                        </div>
                                    </div>
                                </section>

                                <section className="contact-panel">
                                    <div className="flex items-start gap-4 mb-5">
                                        <span className="contact-panel-icon" aria-hidden="true">
                                            <i className="far fa-clock" />
                                        </span>
                                        <div>
                                            <h2 className="text-[9px] font-black uppercase tracking-[0.25em] text-gray-400 mb-1">Business Hours</h2>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Malaysia time</p>
                                        </div>
                                    </div>
                                    <div className="contact-hours-grid">
                                        {BUSINESS_HOURS.map((slot) => (
                                            <div key={slot.day} className="contact-hours-row">
                                                <span className="contact-hours-day">{slot.day}</span>
                                                <span className="contact-hours-time">{slot.time}</span>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>

                            <section className="lg:col-span-2 contact-panel contact-panel--accent">
                                <div className="flex items-start gap-4 mb-5">
                                    <span className="contact-panel-icon contact-panel-icon--dark" aria-hidden="true">
                                        <i className="fab fa-whatsapp" />
                                    </span>
                                    <div>
                                        <h2 className="text-[9px] font-black uppercase tracking-[0.25em] mb-1" style={{ color: '#644117' }}>Contact No</h2>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Tap to WhatsApp</p>
                                    </div>
                                </div>
                                <ul className="space-y-2.5">
                                    {CONTACT_PERSONS.map((person) => (
                                        <li key={person.name}>
                                            <a
                                                href={`https://wa.me/${person.wa}?text=${encodeURIComponent(WHATSAPP_INQUIRY_TEXT)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="contact-person-link group"
                                            >
                                                <span className="min-w-0">
                                                    <span className="block text-[11px] font-black uppercase tracking-tight text-gray-900 group-hover:text-[#644117] transition-colors">
                                                        {person.name}
                                                    </span>
                                                    <span className="block text-xs font-bold text-gray-600 mt-0.5">{person.phone}</span>
                                                </span>
                                                <span className="contact-person-call contact-person-call--wa" aria-hidden="true">
                                                    <i className="fab fa-whatsapp" />
                                                </span>
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        </div>
                    </div>
                </main>
            )}

            {view === 'login' && (
                <main className="flex-grow flex flex-col md:flex-row bg-gray-100 w-full">
                    <div className="flex-1 bg-white p-8 md:p-16 flex flex-col justify-center items-center w-full">
                        <div className="w-full max-sm:max-w-xs">
                            <h2 className="text-2xl font-black uppercase tracking-tighter italic mb-8 border-b-4 inline-block" style={{ borderColor: '#644117' }}>
                                Sign In
                            </h2>
                            <form method="post" action={withBaseUrl('/Account/Login')} className="space-y-4 w-full">
                                <input type="hidden" name={antiForgery?.formFieldName || '__RequestVerificationToken'} value={antiForgery?.requestToken || ''} />
                                {loginError && (
                                    <div className="border border-red-200 bg-red-50 text-red-900 rounded-lg p-3 text-sm">{loginError}</div>
                                )}
                                <input name="email" type="email" placeholder="Email" required className="w-full border p-4 rounded-xl font-bold text-sm" />
                                <input name="password" type="password" placeholder="Password" required className="w-full border p-4 rounded-xl font-bold text-sm" />
                                <button type="submit" className="w-full text-white py-4 rounded-xl font-black uppercase text-[10px]" style={{ backgroundColor: '#644117' }}>
                                    Authorize Access
                                </button>
                            </form>
                        </div>
                    </div>
                </main>
            )}

            {view === 'history' && (
                <main className="flex-grow py-8 md:py-16 bg-gray-50 px-4 md:px-6 w-full">
                    <div className="max-w-3xl mx-auto w-full">
                        <div className="mb-8">
                            <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tighter">Order History</h1>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
                                Track your submitted orders
                            </p>
                        </div>

                        {orders.length === 0 ? (
                            <div className="order-history-empty bg-white border border-dashed border-gray-300 rounded-2xl px-6 py-14 text-center">
                                <div
                                    className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                                    style={{ backgroundColor: '#ffd700' }}
                                >
                                    <i className="fas fa-box-open text-xl" style={{ color: '#644117' }} aria-hidden="true"></i>
                                </div>
                                <h2 className="text-sm font-black uppercase tracking-tight mb-2" style={{ color: '#644117' }}>
                                    No orders yet
                                </h2>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-6">
                                    Browse the catalog and submit your first order
                                </p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        selectAssetType('Product');
                                        goToView('store');
                                    }}
                                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition hover:opacity-90"
                                    style={{ backgroundColor: '#644117' }}
                                >
                                    <i className="fas fa-cubes" aria-hidden="true"></i>
                                    Open Catalog
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {ordersPagination.pageItems.map((order) => {
                                    const itemCount = Array.isArray(order.items) ? order.items.length : 0;
                                    const isDelivered = order.status === 'Delivered';
                                    const isPending = order.status === 'Pending';

                                    return (
                                        <article
                                            key={order.id}
                                            className="order-history-card group relative overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300"
                                        >
                                            <div
                                                className="absolute inset-y-0 left-0 w-1.5"
                                                style={{ backgroundColor: isDelivered ? '#16a34a' : '#ffd700' }}
                                                aria-hidden="true"
                                            />
                                            <div className="pl-6 pr-5 py-5 md:pl-7 md:pr-6 md:py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                                            <i className="far fa-calendar-alt mr-1.5" aria-hidden="true"></i>
                                                            {order.date}
                                                        </span>
                                                        <span
                                                            className={`inline-flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${
                                                                isDelivered
                                                                    ? 'bg-green-50 text-green-700 border-green-100'
                                                                    : isPending
                                                                      ? 'bg-amber-50 text-amber-700 border-amber-100'
                                                                      : 'bg-gray-50 text-gray-600 border-gray-200'
                                                            }`}
                                                        >
                                                            <span
                                                                className={`h-1.5 w-1.5 rounded-sm ${
                                                                    isDelivered ? 'bg-green-600' : isPending ? 'bg-amber-500' : 'bg-gray-400'
                                                                }`}
                                                                aria-hidden="true"
                                                            />
                                                            {order.status}
                                                        </span>
                                                    </div>
                                                    <h3 className="font-black text-base md:text-lg tracking-tight truncate" style={{ color: '#644117' }}>
                                                        {order.id}
                                                    </h3>
                                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                                        {itemCount} {itemCount === 1 ? 'line item' : 'line items'}
                                                    </p>
                                                </div>

                                                <div className="flex flex-col sm:flex-row gap-2 self-start sm:self-auto w-full sm:w-auto">
                                                    <button
                                                        type="button"
                                                        onClick={() => addOrderItemsToCart(order)}
                                                        className="order-history-reorder-btn inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all duration-300 hover:opacity-90"
                                                        style={{
                                                            backgroundColor: '#644117',
                                                            color: '#ffffff',
                                                            borderColor: '#644117',
                                                        }}
                                                    >
                                                        Re-Order
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => viewOrderDetails(order)}
                                                        className="order-history-view-btn inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all duration-300 group-hover:shadow-sm"
                                                        style={{
                                                            backgroundColor: '#ffd700',
                                                            color: '#644117',
                                                            borderColor: '#e6c200',
                                                        }}
                                                    >
                                                        View Details
                                                        <i className="fas fa-arrow-right text-[10px] transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                                <ListPagination {...ordersPagination} label="orders" />
                            </div>
                        )}
                    </div>
                </main>
            )}

            {view === 'store' && (
                <main className="flex-grow py-8 md:py-16 bg-gray-50 px-4 md:px-6 w-full">
                    <div className="max-w-7xl mx-auto w-full">
                        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tighter">Product Catalog</h1>
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
                                    {selectedAssetType === 'Gift' ? 'Browse gift assets' : 'Browse stock products'}
                                </p>
                            </div>

                            <div
                                className="catalog-type-switch inline-flex w-full sm:w-auto p-1.5 rounded-2xl border border-gray-200 shadow-sm"
                                role="tablist"
                                aria-label="Catalog type"
                            >
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={selectedAssetType === 'Product'}
                                    onClick={() => selectAssetType('Product')}
                                    className={`catalog-type-tab flex-1 sm:flex-none inline-flex items-center justify-center gap-2.5 px-7 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.18em] transition-all duration-300 ${
                                        selectedAssetType === 'Product'
                                            ? 'catalog-type-tab--product is-active text-white shadow-md'
                                            : 'text-gray-500 hover:text-[#644117] hover:bg-white/70'
                                    }`}
                                >
                                    <i className="fas fa-cubes text-xs opacity-90" aria-hidden="true"></i>
                                    Products
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={selectedAssetType === 'Gift'}
                                    onClick={() => selectAssetType('Gift')}
                                    className={`catalog-type-tab flex-1 sm:flex-none inline-flex items-center justify-center gap-2.5 px-7 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.18em] transition-all duration-300 ${
                                        selectedAssetType === 'Gift'
                                            ? 'catalog-type-tab--gift is-active shadow-md'
                                            : 'text-gray-500 hover:text-[#644117] hover:bg-white/70'
                                    }`}
                                >
                                    <i className="fas fa-gift text-xs opacity-90" aria-hidden="true"></i>
                                    Gifts
                                </button>
                            </div>
                        </div>

                        <div className="mb-10 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <label className="text-[10px] font-black uppercase text-gray-400 block mb-4 tracking-widest">Select Segments</label>
                            <div className="flex flex-wrap gap-6">
                                <label className="flex items-center space-x-3 cursor-pointer group">
                                    <input
                                        type="radio"
                                        name="catFilter"
                                        value="All"
                                        checked={selectedCategory === 'All'}
                                        onChange={() => setSelectedCategory('All')}
                                        className="w-4 h-4 text-black border-gray-300 focus:ring-black"
                                    />
                                    <span
                                        className={`text-xs font-black uppercase tracking-tight group-hover:text-red-600 transition ${selectedCategory === 'All' ? 'text-red-600' : 'text-gray-700'}`}
                                    >
                                        All Segments
                                    </span>
                                </label>

                                {permittedCategories.map((cat) => (
                                    <label key={cat} className="flex items-center space-x-3 cursor-pointer group">
                                        <input
                                            type="radio"
                                            name="catFilter"
                                            value={cat}
                                            checked={selectedCategory === cat}
                                            onChange={() => setSelectedCategory(cat)}
                                            className="w-4 h-4 text-black border-gray-300 focus:ring-black"
                                        />
                                        <span
                                            className={`text-xs font-black uppercase tracking-tight group-hover:text-red-600 transition ${selectedCategory === cat ? 'text-red-600' : 'text-gray-700'}`}
                                        >
                                            {cat}
                                        </span>
                                    </label>
                                ))}
                            </div>

                            <div className="mt-6">
                                <label className="text-[10px] font-black uppercase text-gray-400 block mb-2 tracking-widest">Search Product Name</label>
                                <div className="flex gap-2">
                                    <input
                                        value={productSearch}
                                        onChange={(e) => setProductSearch(e.target.value)}
                                        type="text"
                                        placeholder="Type to search..."
                                        className="w-full border p-3 rounded-xl text-xs font-bold"
                                    />
                                    {productSearch.trim() !== '' && (
                                        <button
                                            type="button"
                                            onClick={() => setProductSearch('')}
                                            className="px-4 rounded-xl text-[10px] font-black uppercase bg-gray-100 text-gray-700 hover:bg-gray-200"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                            {catalogPagination.pageItems.map((product) => (
                                <div key={product.id} className="bg-white border p-6 md:p-8 rounded-2xl md:rounded-3xl shadow-sm hover:shadow-lg transition flex flex-col relative">
                                    {product.images && product.images.length > 0 && (
                                        <div className="relative group mb-4">
                                            <div
                                                id={`carousel-${product.id}`}
                                                className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar rounded-xl border border-gray-100 h-48 bg-gray-50"
                                            >
                                                {product.images.map((img, index) => (
                                                    <div key={index} className="flex-none w-full snap-center flex items-center justify-center">
                                                        <img src={img} className="w-full h-full object-contain" />
                                                    </div>
                                                ))}
                                            </div>

                                            {product.images.length > 1 && (
                                                <div className="absolute inset-0 flex items-center justify-between px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => document.getElementById(`carousel-${product.id}`)?.scrollBy({ left: -200, behavior: 'smooth' })}
                                                        className="bg-white/80 p-1.5 rounded-full shadow-md hover:bg-white text-black font-black text-xs"
                                                        type="button"
                                                    >
                                                        ←
                                                    </button>
                                                    <button
                                                        onClick={() => document.getElementById(`carousel-${product.id}`)?.scrollBy({ left: 200, behavior: 'smooth' })}
                                                        className="bg-white/80 p-1.5 rounded-full shadow-md hover:bg-white text-black font-black text-xs"
                                                        type="button"
                                                    >
                                                        →
                                                    </button>
                                                </div>
                                            )}

                                            {product.images.length > 1 && (
                                                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[8px] px-2 py-1 rounded-full font-black uppercase tracking-widest">
                                                    {product.images.length} Photos
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded ${product.type === 'Gift' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {product.type}
                                        </span>
                                        <span className="text-[9px] font-black text-red-600 uppercase">{product.category}</span>
                                    </div>
                                    <h3 className="text-lg md:text-xl font-black uppercase mb-3">{product.name}</h3>
                                    <p className="text-zinc-500 text-[11px] mb-6 flex-grow">{product.desc}</p>

                                    <div className="flex justify-between items-center mt-auto pt-4 border-t gap-2">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-gray-400 uppercase">Estimated Range</span>
                                            {isLoggedIn && <span className="text-sm md:text-lg font-black">{`RM${asMoney(product.minPrice)} - ${asMoney(product.maxPrice)}`}</span>}
                                            {!isLoggedIn && <span className="text-[9px] bg-gray-100 text-gray-400 px-2 py-1 rounded-lg font-black uppercase mt-1">Login to View Price</span>}
                                        </div>

                                        <button
                                            onClick={() => (isLoggedIn ? addToCart(product) : redirectToLogin())}
                                            disabled={product.qtyControl && Number(product.qty) <= 0}
                                            className={`w-full px-5 py-3 rounded-xl font-black uppercase text-[9px] ${product.qtyControl && Number(product.qty) <= 0 ? 'bg-gray-300 text-gray-700 cursor-not-allowed' : 'text-white'}`}
                                            style={product.qtyControl && Number(product.qty) <= 0 ? undefined : { backgroundColor: '#644117' }}
                                            type="button"
                                        >
                                            {product.qtyControl && Number(product.qty) <= 0 ? 'OUT OF STOCK' : 'Add to Cart'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {storeProducts.length === 0 ? (
                            <div className="text-center py-20">
                                <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">No assets found matching these requirements.</p>
                            </div>
                        ) : (
                            <ListPagination {...catalogPagination} label="products" />
                        )}
                    </div>
                </main>
            )}

            {view === 'cart' && (
                <main className="flex-grow py-8 md:py-16 bg-gray-50 px-4 w-full">
                    <div className="max-w-3xl mx-auto w-full">
                        <h1 className="text-2xl font-black uppercase mb-8 tracking-tighter">Your Orders</h1>

                        <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
                            {cart.length === 0 && (
                                <div className="p-12 text-center">
                                    <p className="text-[10px] font-black uppercase text-gray-400 mb-4 tracking-widest">Orders is empty</p>
                                    <button onClick={() => setView('store')} className="text-black border-b-2 border-black font-black uppercase text-[10px] tracking-widest" type="button">
                                        Return to Products
                                    </button>
                                </div>
                            )}

                            {cart.length > 0 && (
                                <div>
                                    {cart.map((item) => (
                                        <div key={item.id} className="p-6 border-b flex justify-between items-center">
                                            <div className="flex items-center gap-4">
                                                {item.images && item.images.length > 0 && <img src={item.images[0]} className="w-12 h-12 object-cover rounded border" />}
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded ${item.type === 'Gift' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                            {item.type}
                                                        </span>
                                                        <span className="text-[8px] font-black text-red-600 uppercase tracking-widest">{item.category}</span>
                                                    </div>
                                                    <h3 className="font-black uppercase text-sm">{item.name}</h3>
                                                    <div className="flex items-center space-x-4 mt-2">
                                                        <span className="text-[10px] font-bold">{`RM${asMoney(item.minPrice)} - ${asMoney(item.maxPrice)}`}</span>
                                                        <div className="flex items-center border rounded-lg overflow-hidden">
                                                            <button
                                                                onClick={() =>
                                                                    setCart((prev) =>
                                                                        prev
                                                                            .map((p) => (p.id === item.id ? { ...p, cartQty: Math.max(0, p.cartQty - 1) } : p))
                                                                            .filter((p) => p.cartQty > 0),
                                                                    )
                                                                }
                                                                className="px-2 py-1 text-xs font-black bg-gray-50 hover:bg-gray-100"
                                                                type="button"
                                                            >
                                                                -
                                                            </button>
                                                            <span className="px-3 py-1 text-[10px] font-black border-x bg-white">{item.cartQty}</span>
                                                            <button
                                                                onClick={() => setCart((prev) => prev.map((p) => (p.id === item.id ? { ...p, cartQty: p.cartQty + 1 } : p)))}
                                                                className="px-2 py-1 text-xs font-black bg-gray-50 hover:bg-gray-100"
                                                                type="button"
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <button onClick={() => removeFromCart(item.id)} className="text-[8px] font-black text-gray-400 uppercase hover:text-red-600 transition" type="button">
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    <div className="cart-submit-bar p-4 sm:p-6 bg-gray-50 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-6">
                                        <p className="text-[9px] font-black text-gray-500 uppercase italic leading-relaxed">
                                            Prices shown are estimates based on standard ranges.
                                        </p>
                                        <button
                                            onClick={submitOrder}
                                            className="cart-submit-btn inline-flex items-center justify-center gap-2 w-full sm:w-auto shrink-0 px-6 py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest text-white transition-all duration-300"
                                            type="button"
                                        >
                                            <i className="fas fa-paper-plane text-[11px]" aria-hidden="true"></i>
                                            Submit Order
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            )}

            {isLoggedIn && cart.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 z-40 p-4">
                    <div className="max-w-7xl mx-auto">
                        <button
                            onClick={() => setView('cart')}
                            className="w-full bg-black text-white p-4 rounded-2xl shadow-2xl flex justify-between items-center hover:bg-zinc-800 transition-all border border-zinc-700"
                            style={{ backgroundColor: '#644117' }}
                            type="button"
                        >
                            <div className="flex items-center space-x-4">
                                <div className="relative">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
                                    </svg>
                                    <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
                                        {cart.length}
                                    </span>
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest">Review Selected Items</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <span className="text-[10px] font-black uppercase">View Cart</span>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                                </svg>
                            </div>
                        </button>
                    </div>
                </div>
            )}

            {showWhatsAppPicker && (
                <div
                    className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                    onClick={() => setShowWhatsAppPicker(false)}
                >
                    <div
                        className="order-details-modal bg-white w-full max-w-md rounded-2xl overflow-hidden max-h-[85vh] flex flex-col shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="whatsapp-picker-title"
                    >
                        <div
                            className="px-6 md:px-8 pt-6 pb-5 border-b border-gray-100"
                            style={{
                                background: 'linear-gradient(180deg, #fff8cc 0%, #ffffff 100%)',
                            }}
                        >
                            <div className="flex justify-between items-start gap-4">
                                <div className="min-w-0 flex items-start gap-3">
                                    <span
                                        className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center text-white text-xl"
                                        style={{ backgroundColor: '#25D366' }}
                                        aria-hidden="true"
                                    >
                                        <i className="fab fa-whatsapp" />
                                    </span>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 mb-1">WhatsApp</p>
                                        <h2
                                            id="whatsapp-picker-title"
                                            className="text-base md:text-lg font-black uppercase tracking-tight"
                                            style={{ color: '#644117' }}
                                        >
                                            Contact No
                                        </h2>
                                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                                            Tap a number to chat
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowWhatsAppPicker(false)}
                                    className="shrink-0 h-9 w-9 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-[#644117] hover:border-[#ffd700] transition flex items-center justify-center"
                                    type="button"
                                    aria-label="Close WhatsApp contacts"
                                >
                                    <i className="fas fa-times" aria-hidden="true"></i>
                                </button>
                            </div>
                        </div>

                        <div className="px-6 md:px-8 py-5 overflow-y-auto">
                            <ul className="space-y-2.5">
                                {CONTACT_PERSONS.map((person) => (
                                    <li key={person.name}>
                                        <a
                                            href={`https://wa.me/${person.wa}?text=${encodeURIComponent(WHATSAPP_INQUIRY_TEXT)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="contact-person-link group"
                                            onClick={() => setShowWhatsAppPicker(false)}
                                        >
                                            <span className="min-w-0">
                                                <span className="block text-[11px] font-black uppercase tracking-tight text-gray-900 group-hover:text-[#644117] transition-colors">
                                                    {person.name}
                                                </span>
                                                <span className="block text-xs font-bold text-gray-600 mt-0.5">{person.phone}</span>
                                            </span>
                                            <span className="contact-person-call contact-person-call--wa" aria-hidden="true">
                                                <i className="fab fa-whatsapp" />
                                            </span>
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="px-6 md:px-8 py-4 border-t border-gray-100 bg-white">
                            <button
                                type="button"
                                onClick={() => setShowWhatsAppPicker(false)}
                                className="w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition hover:opacity-90"
                                style={{ backgroundColor: '#644117' }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showOrderDetails && selectedOrder && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="order-details-modal bg-white w-full max-w-md rounded-2xl overflow-hidden max-h-[85vh] flex flex-col shadow-2xl">
                        <div
                            className="px-6 md:px-8 pt-6 pb-5 border-b border-gray-100"
                            style={{
                                background: 'linear-gradient(180deg, #fff8cc 0%, #ffffff 100%)',
                            }}
                        >
                            <div className="flex justify-between items-start gap-4">
                                <div className="min-w-0">
                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 mb-1">Order details</p>
                                    <h2 className="text-base md:text-lg font-black uppercase tracking-tight truncate" style={{ color: '#644117' }}>
                                        {selectedOrder.id}
                                    </h2>
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <span
                                            className={`inline-flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${
                                                selectedOrder.status === 'Delivered'
                                                    ? 'bg-green-50 text-green-700 border-green-100'
                                                    : selectedOrder.status === 'Pending'
                                                      ? 'bg-amber-50 text-amber-700 border-amber-100'
                                                      : 'bg-gray-50 text-gray-600 border-gray-200'
                                            }`}
                                        >
                                            {selectedOrder.status}
                                        </span>
                                        {selectedOrder.date && (
                                            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
                                                {selectedOrder.date}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowOrderDetails(false)}
                                    className="shrink-0 h-9 w-9 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-[#644117] hover:border-[#ffd700] transition flex items-center justify-center"
                                    type="button"
                                    aria-label="Close order details"
                                >
                                    <i className="fas fa-times" aria-hidden="true"></i>
                                </button>
                            </div>
                        </div>

                        <div className="px-6 md:px-8 py-5 overflow-y-auto space-y-3">
                            {(selectedOrder.items || []).map((item, index) => (
                                <div
                                    key={`${item.name}-${index}`}
                                    className="rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3 flex justify-between items-center gap-4"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span
                                                className={`text-[6px] font-black uppercase px-1.5 py-0.5 rounded ${
                                                    item.type === 'Gift' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                                }`}
                                            >
                                                {item.type}
                                            </span>
                                            <span className="text-[10px] font-black uppercase tracking-tight truncate">{item.name}</span>
                                        </div>
                                        <span className="text-[8px] text-gray-400 italic font-bold">
                                            {`Range: RM${asMoney(item.minPrice)} - ${asMoney(item.maxPrice)}`}
                                        </span>
                                    </div>
                                    <div className="shrink-0 text-center px-3 py-1.5 rounded-lg bg-white border border-gray-100">
                                        <span className="block text-[7px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Qty</span>
                                        <span className="font-black text-sm" style={{ color: '#644117' }}>
                                            {item.qty}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="px-6 md:px-8 py-4 border-t border-gray-100 bg-white">
                            <button
                                type="button"
                                onClick={() => setShowOrderDetails(false)}
                                className="w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition hover:opacity-90"
                                style={{ backgroundColor: '#644117' }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <footer className="site-footer mt-auto shrink-0" style={{ backgroundColor: '#ffd700' }}>
                <div className="site-footer-inner max-w-5xl mx-auto px-3 md:px-6 py-3 md:py-10">
                    <div className="site-footer-brand mb-2 md:mb-8 text-center md:text-left">
                        <h2 className="text-sm md:text-2xl font-black uppercase tracking-tighter italic" style={{ color: '#644117' }}>
                            {COMPANY_NAME}
                        </h2>
                    </div>

                    <div className="site-footer-grid grid grid-cols-2 gap-2.5 md:gap-20 mb-2.5 md:mb-8">
                        <div>
                            <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.25em] text-[#644117]/opacity-70 mb-1.5 md:mb-3">
                                Contact No
                            </p>
                            <ul className="site-footer-contacts space-y-1 md:space-y-2">
                                {CONTACT_PERSONS.map((person) => (
                                    <li key={person.name} className="site-footer-contact-row">
                                        <span className="font-black uppercase tracking-tight">{person.name}</span>
                                        <span className="site-footer-contact-phone">
                                            <a
                                                href={`https://wa.me/${person.wa}?text=${encodeURIComponent(WHATSAPP_INQUIRY_TEXT)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="site-footer-wa-btn"
                                                aria-label={`WhatsApp ${person.name}`}
                                            >
                                                <i className="fab fa-whatsapp" aria-hidden="true" />
                                            </a>
                                            <span className="font-bold opacity-80">{person.phone}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.25em] text-[#644117]/opacity-70 mb-1.5 md:mb-3">
                                Business Hours
                            </p>
                            <ul className="site-footer-hours space-y-1 md:space-y-2">
                                {BUSINESS_HOURS.map((slot) => (
                                    <li key={slot.day} className="site-footer-hours-row">
                                        <span className="font-black uppercase tracking-tight">{slot.day}</span>
                                        <span className="font-bold">{slot.time}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <p className="text-center text-[8px] md:text-[10px] uppercase tracking-[0.12em] md:tracking-[0.3em] font-bold text-[#644117]/opacity-70 px-1 break-words">
                        © 2026 SKTOP Management Terminal | All Rights Reserved.
                    </p>
                </div>
            </footer>
        </div>
    );
}
