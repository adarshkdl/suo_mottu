'use client';

export interface RepeatColumn<T> {
  key: keyof T;
  label: string;
  placeholder?: string;
  type?: 'text' | 'number' | 'date' | 'time';
}

interface RepeatTableProps<T extends Record<keyof T, string>> {
  rows: T[];
  columns: RepeatColumn<T>[];
  emptyRow: T;
  onChange: (rows: T[]) => void;
  addLabel: string;
}

export default function RepeatTable<T extends Record<keyof T, string>>({
  rows,
  columns,
  emptyRow,
  onChange,
  addLabel,
}: RepeatTableProps<T>) {
  const updateCell = (rowIndex: number, key: keyof T, value: string) => {
    const next = rows.map((row, i) => (i === rowIndex ? { ...row, [key]: value } : row));
    onChange(next);
  };

  const addRow = () => {
    onChange([...rows, { ...emptyRow }]);
  };

  const removeRow = (rowIndex: number) => {
    onChange(rows.filter((_, i) => i !== rowIndex));
  };

  return (
    <>
      <table className="repeat-table">
        <thead>
          <tr>
            <th>#</th>
            {columns.map((col) => (
              <th key={String(col.key)}>{col.label}</th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={columns.length + 2}>No rows added yet</td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                <td className="row-num">{i + 1}</td>
                {columns.map((col) => (
                  <td key={String(col.key)}>
                    <input
                      type={col.type || 'text'}
                      placeholder={col.placeholder}
                      value={row[col.key] as string}
                      onChange={(e) => updateCell(i, col.key, e.target.value)}
                    />
                  </td>
                ))}
                <td>
                  <button type="button" className="btn-remove" onClick={() => removeRow(i)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <button type="button" className="btn-add" onClick={addRow}>
        + {addLabel}
      </button>
    </>
  );
}
