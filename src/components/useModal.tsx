import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import { noop } from "../lib";

interface ModalProps {
  width?: number;
  header?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  closeOnClickMask?: boolean;
}

interface UseModalProps {
  onModalVisible?: typeof noop;
}

export default function useModal({ onModalVisible }: UseModalProps = {}) {
  const [visible, setVisible] = useState(false);

  const openModal = useCallback(() => setVisible(true), []);
  const closeModal = useCallback(() => setVisible(false), []);

  useEffect(() => {
    if (visible) {
      onModalVisible?.();
    }
  }, [visible, onModalVisible]);

  const Modal = useCallback(
    ({ width, header, children, footer, closeOnClickMask }: ModalProps) => {
      if (!visible) return;

      return createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onPointerDown={closeOnClickMask ? closeModal : undefined}
        >
          <div
            className={`h-fit max-h-full overflow-y-auto bg-surface-900 border-surface-700 w-full max-w-full rounded-xl border shadow-2xl`}
            style={{ width: width ?? 400 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {header && (
              <div className="border-surface-700 border-b px-6 py-4">
                <h3 className="text-lg font-semibold text-slate-100">
                  {header}
                </h3>
              </div>
            )}
            <div className="px-6 py-4 text-slate-200">
              {children}
            </div>
            {footer && (
              <div className="bg-surface-800/50 flex justify-end gap-2 rounded-b-xl px-6 py-4">
                {footer}
              </div>
            )}
          </div>
        </div>,
        document.body,
      );
    },
    [visible, closeModal],
  );

  return {
    Modal,
    openModal,
    closeModal,
  };
}
