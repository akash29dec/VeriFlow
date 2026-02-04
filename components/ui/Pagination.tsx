import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  isLoading = false,
}: PaginationProps) {
  // Helpers
  const startItem = Math.min((currentPage - 1) * pageSize + 1, totalItems);
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers to show (simplified windowing logic)
  // Shows: 1 2 3 4 5 ... 10 or 1 ... 4 5 6 ... 10, etc.
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5; // how many numbers to show at once

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      // Logic for ellipsis
      if (currentPage <= 3) {
        // Start: 1 2 3 ... 10
        pages.push(1, 2, 3, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        // End: 1 ... 8 9 10
        pages.push(1, '...', totalPages - 2, totalPages - 1, totalPages);
      } else {
        // Middle: 1 ... 4 5 6 ... 10
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  if (totalItems === 0) return null;

  return (
    <div className="px-6 py-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4 bg-white rounded-b-xl border-gray-200">
      {/* Left: Showing X to Y of Z */}
      <p className="text-sm text-gray-500">
        Showing <span className="font-medium text-gray-900">{startItem}</span> to{' '}
        <span className="font-medium text-gray-900">{endItem}</span> of{' '}
        <span className="font-medium text-gray-900">{totalItems}</span> results
      </p>

      {/* Right: Arrows and Numbers */}
      <div className="flex items-center gap-2">
        {/* Previous Arrow */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || isLoading}
          className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-500 hover:text-gray-900"
          title="Previous"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Numbers */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((p, idx) => (
            <button
              key={idx}
              onClick={() => typeof p === 'number' && onPageChange(p)}
              disabled={typeof p !== 'number' || isLoading}
              className={`min-w-[32px] h-8 px-2 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                p === currentPage
                  ? 'bg-blue-600 text-white shadow-sm'
                  : typeof p === 'number'
                  ? 'text-gray-600 hover:bg-gray-100'
                  : 'text-gray-400 cursor-default'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Next Arrow */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || isLoading}
          className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-500 hover:text-gray-900"
          title="Next"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
