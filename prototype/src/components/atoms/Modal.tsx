import React, { useEffect, useRef } from 'react';
import { cn } from '../../utils/cn';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  closeLabel?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'md',
  closeLabel = 'Bağla',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save previously focused element to restore upon close (WCAG 2.1 AA)
    previousActiveElementRef.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';

    // Focus first focusable element inside modal
    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(focusableSelectors);
    if (focusableElements && focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trapping: cycle through focusable elements
      if (e.key === 'Tab' && modalRef.current) {
        const elements = modalRef.current.querySelectorAll<HTMLElement>(focusableSelectors);
        if (!elements || elements.length === 0) return;

        const firstElement = elements[0];
        const lastElement = elements[elements.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: going backwards
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: going forwards
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
      // Restore focus to previously focused element upon close
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className={cn(
          'w-full bg-navy-900 border border-cyan-primary/30 rounded-2xl shadow-glow overflow-hidden flex flex-col max-h-[90vh] transition-all transform scale-100',
          widthStyles[maxWidth]
        )}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800 bg-navy-850/50">
          <div>
            <h3 id="modal-title" className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <span className="text-cyan-primary">◆</span> {title}
            </h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label={closeLabel}
            className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-navy-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-primary/50"
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-sm text-slate-300">
          {children}
        </div>

        {/* Modal Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-800 bg-navy-850/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
