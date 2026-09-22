'use client';

import { ChangeEvent, forwardRef, TextareaHTMLAttributes, InputHTMLAttributes } from 'react';

interface BaseProps {
  id: string;
  label: string;
  mal?: string;
  required?: boolean;
  invalid?: boolean;
  span2?: boolean;
  fieldHidden?: boolean;
}

type InputFieldProps = BaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'onChange'> & {
    as?: 'input';
    onValueChange: (value: string) => void;
  };

type TextareaFieldProps = BaseProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'onChange'> & {
    as: 'textarea';
    onValueChange: (value: string) => void;
  };

type FieldProps = InputFieldProps | TextareaFieldProps;

const Field = forwardRef<HTMLInputElement | HTMLTextAreaElement, FieldProps>((props, ref) => {
  const { id, label, mal, required, invalid, span2, fieldHidden, onValueChange, as, ...rest } = props;

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onValueChange(e.target.value);
  };

  return (
    <div hidden={fieldHidden} className={`field ${invalid ? 'invalid' : ''} ${span2 ? 'field-span-2' : ''}`}>
      {label && (
        <label htmlFor={id}>
          {label} {mal && <span className="mal">{mal}</span>} {required && <span className="req">*</span>}
        </label>
      )}
      {as === 'textarea' ? (
        <textarea
          id={id}
          ref={ref as React.Ref<HTMLTextAreaElement>}
          onChange={handleChange}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          id={id}
          ref={ref as React.Ref<HTMLInputElement>}
          onChange={handleChange}
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
    </div>
  );
});

Field.displayName = 'Field';

export default Field;
