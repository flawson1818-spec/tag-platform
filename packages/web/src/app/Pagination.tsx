import { useTranslation } from 'react-i18next';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        {t('pagination.previous')}
      </button>
      <span className="pagination-status">{t('pagination.status', { page, totalPages })}</span>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
        {t('pagination.next')}
      </button>
    </div>
  );
}

export default Pagination;
