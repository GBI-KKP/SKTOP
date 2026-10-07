import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DESKTOP_MQ = '(min-width: 768px)';

function useIsDesktop(breakpointQuery = DESKTOP_MQ) {
    const [isDesktop, setIsDesktop] = useState(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return true;
        }
        return window.matchMedia(breakpointQuery).matches;
    });

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return undefined;
        }

        const media = window.matchMedia(breakpointQuery);
        const onChange = (event) => setIsDesktop(event.matches);

        setIsDesktop(media.matches);

        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', onChange);
            return () => media.removeEventListener('change', onChange);
        }

        media.addListener(onChange);
        return () => media.removeListener(onChange);
    }, [breakpointQuery]);

    return isDesktop;
}

/**
 * Desktop: classic page pagination (page size 10).
 * Mobile: infinite scroll window (initial 50, then +50).
 */
export function useResponsivePagination(items, resetKey = '') {
    const list = Array.isArray(items) ? items : [];
    const isDesktop = useIsDesktop();
    const desktopPageSize = 10;
    const mobilePageSize = 50;

    const [page, setPage] = useState(1);
    const [visibleCount, setVisibleCount] = useState(mobilePageSize);

    useEffect(() => {
        setPage(1);
        setVisibleCount(mobilePageSize);
    }, [resetKey, isDesktop, mobilePageSize]);

    const pageCount = Math.max(1, Math.ceil(list.length / desktopPageSize) || 1);

    useEffect(() => {
        if (page > pageCount) {
            setPage(pageCount);
        }
    }, [page, pageCount]);

    const pageItems = useMemo(() => {
        if (isDesktop) {
            const start = (page - 1) * desktopPageSize;
            return list.slice(start, start + desktopPageSize);
        }
        return list.slice(0, visibleCount);
    }, [desktopPageSize, isDesktop, list, page, visibleCount]);

    const hasMore = !isDesktop && visibleCount < list.length;

    const loadMore = useCallback(() => {
        if (!hasMore) return;
        setVisibleCount((prev) => Math.min(prev + mobilePageSize, list.length));
    }, [hasMore, list.length, mobilePageSize]);

    return {
        isDesktop,
        pageItems,
        page,
        setPage,
        pageCount,
        totalCount: list.length,
        pageSize: isDesktop ? desktopPageSize : mobilePageSize,
        hasMore,
        loadMore,
        showingCount: pageItems.length,
    };
}
