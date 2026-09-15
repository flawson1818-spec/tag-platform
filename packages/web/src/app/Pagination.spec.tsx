import { render, screen } from '@testing-library/react';
import { Pagination } from './Pagination';
import i18n from '../i18n/config';

describe('Pagination', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('fr');
  });

  it('renders nothing when there is only one page', () => {
    const { container } = render(<Pagination page={1} totalPages={1} onChange={vi.fn()} />);

    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when totalPages is 0 (empty list)', () => {
    const { container } = render(<Pagination page={1} totalPages={0} onChange={vi.fn()} />);

    expect(container.innerHTML).toBe('');
  });

  it('disables "Précédent" on the first page and enables "Suivant"', () => {
    render(<Pagination page={1} totalPages={3} onChange={vi.fn()} />);

    expect((screen.getByText('← Précédent') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Suivant →') as HTMLButtonElement).disabled).toBe(false);
  });

  it('enables both buttons on a middle page', () => {
    render(<Pagination page={2} totalPages={3} onChange={vi.fn()} />);

    expect((screen.getByText('← Précédent') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByText('Suivant →') as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables "Suivant" on the last page', () => {
    render(<Pagination page={3} totalPages={3} onChange={vi.fn()} />);

    expect((screen.getByText('← Précédent') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByText('Suivant →') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the current page and total', () => {
    render(<Pagination page={2} totalPages={5} onChange={vi.fn()} />);

    expect(screen.getByText('Page 2 / 5')).toBeTruthy();
  });

  it('calls onChange with page + 1 / page - 1 when the buttons are clicked', () => {
    const onChange = vi.fn();
    render(<Pagination page={2} totalPages={3} onChange={onChange} />);

    screen.getByText('Suivant →').click();
    expect(onChange).toHaveBeenCalledWith(3);

    screen.getByText('← Précédent').click();
    expect(onChange).toHaveBeenCalledWith(1);
  });
});
