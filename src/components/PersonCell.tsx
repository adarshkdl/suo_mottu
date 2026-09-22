'use client';

export default function PersonCell({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  span2,
  required,
  readOnly,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  span2?: boolean;
  required?: boolean;
  readOnly?: boolean;
}) {
  const invalid = required && !value?.trim();
  return (
    <div className={`occ-cell${span2 ? ' occ-cell-span2' : ''}${invalid ? ' occ-cell-invalid' : ''}`}>
      <label>
        {label} {required && <span className="req">*</span>}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
      />
    </div>
  );
}
