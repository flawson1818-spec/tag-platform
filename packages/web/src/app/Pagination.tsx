interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        ← Précédent
      </button>
      <span className="pagination-status">
        Page {page} / {totalPages}
      </span>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
        Suivant →
      </button>
    </div>
  );
}

export default Pagination;
