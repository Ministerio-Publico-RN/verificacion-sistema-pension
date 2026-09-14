import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  totalItems
}) {
  if (totalItems === 0) return null;

  const start = Math.min((currentPage - 1) * pageSize + 1, totalItems);
  const end = Math.min(currentPage * pageSize, totalItems);

  // Páginas visibles
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="mpfn-pagination-bar">
      <div className="mpfn-pagination-info">
        Mostrando <strong>{start}</strong> - <strong>{end}</strong> de <strong>{totalItems}</strong> registros
      </div>

      <div className="mpfn-pagination-controls">
        <button
          className="mpfn-page-btn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          type="button"
        >
          <ChevronLeft size={16} />
        </button>

        {getPageNumbers().map(p => (
          <button
            key={p}
            className={`mpfn-page-btn ${currentPage === p ? 'is-active' : ''}`}
            onClick={() => onPageChange(p)}
            type="button"
          >
            {p}
          </button>
        ))}

        <button
          className="mpfn-page-btn"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          type="button"
        >
          <ChevronRight size={16} />
        </button>

        <select
          className="mpfn-select-sm"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          <option value={15}>15 por pág.</option>
          <option value={30}>30 por pág.</option>
          <option value={50}>50 por pág.</option>
          <option value={100}>100 por pág.</option>
        </select>
      </div>
    </div>
  );
}
