import React, { useEffect, useRef } from 'react';

export default function ListPagination({
    isDesktop,
    page,
    setPage,
    pageCount,
    totalCount,
    showingCount,
    hasMore,
    loadMore,
    label = 'items',
}) {
    const sentinelRef = useRef(null);

    useEffect(() => {
        if (isDesktop || !hasMore) return undefined;
        const node = sentinelRef.current;
        if (!node || typeof IntersectionObserver === 'undefined') return undefined;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    loadMore();
                }
            },
            { root: null, rootMargin: '240px 0px', threshold: 0 }
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [hasMore, isDesktop, loadMore, showingCount]);

    if (totalCount <= 0) {
        return null;
    }

    if (isDesktop) {
        if (totalCount <= 10) {
            return (
                <div className="list-pagination mt-6 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-widest text-gray-400">
                    <span>
                        Showing {showingCount} of {totalCount} {label}
                    </span>
                </div>
            );
        }

        return (
            <div className="list-pagination mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Showing {(page - 1) * 10 + 1}-{Math.min(page * 10, totalCount)} of {totalCount} {label}
                </span>
                <div className="inline-flex items-center gap-2">
                    <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage(Math.max(1, page - 1))}
                        className="px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed transition hover:border-[#ffd700]"
                        style={{ color: '#644117', borderColor: '#d1d5db', backgroundColor: '#fff' }}
                    >
                        Prev
                    </button>
                    <span className="min-w-[5.5rem] text-center text-[10px] font-black uppercase tracking-widest" style={{ color: '#644117' }}>
                        Page {page} / {pageCount}
                    </span>
                    <button
                        type="button"
                        disabled={page >= pageCount}
                        onClick={() => setPage(Math.min(pageCount, page + 1))}
                        className="px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed transition hover:border-[#ffd700]"
                        style={{ color: '#644117', borderColor: '#d1d5db', backgroundColor: '#fff' }}
                    >
                        Next
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="list-pagination mt-6">
            <p className="text-center text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
                Showing {showingCount} of {totalCount} {label}
            </p>
            {hasMore ? (
                <div ref={sentinelRef} className="flex flex-col items-center gap-2 py-2">
                    <div className="h-8 w-8 rounded-full border-2 border-[#ffd700] border-t-[#644117] animate-spin" aria-hidden="true" />
                    <button
                        type="button"
                        onClick={loadMore}
                        className="text-[9px] font-black uppercase tracking-widest"
                        style={{ color: '#644117' }}
                    >
                        Load more
                    </button>
                </div>
            ) : (
                <p className="text-center text-[9px] font-bold uppercase tracking-widest text-gray-300">End of list</p>
            )}
        </div>
    );
}
