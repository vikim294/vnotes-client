import { useEffect } from "react";
import { createRoot } from "react-dom/client";

type ToastType = "info" | "error" | "success" | "warning";

export class Toast {
  static show(msg: string, type: ToastType = "info") {
    // 给body添加一个toast 元素，3秒后销毁

    // 创建容器（className 用于调试时识别 toast 元素）
    const container = document.createElement("div");
    container.className = "toast-wrapper";
    document.body.appendChild(container);

    const root = createRoot(container);

    const handleClose = () => {
      root.unmount();
      container.remove();
    };

    root.render(<ToastComp msg={msg} type={type} onClose={handleClose} />);
  }

  static error(msg: string) {
    Toast.show(msg, "error");
  }

  static warning(msg: string) {
    Toast.show(msg, "warning");
  }

  static success(msg: string) {
    Toast.show(msg, "success");
  }
}

interface ToastCompProps {
  msg: string;
  type: ToastType;
  onClose: () => void;
}
const ToastComp = ({ msg, type, onClose }: ToastCompProps) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  let bgClassName = "";

  switch (type) {
    case "info":
      bgClassName = "bg-node";
      break;

    case "error":
      bgClassName = "bg-error";
      break;

    case "success":
      bgClassName = "bg-success";
      break;

    case "warning":
      bgClassName = "bg-warning";
      break;

    default:
      break;
  }

  return (
    <div
      className={`${bgClassName} fixed top-10 left-1/2 -translate-x-1/2 rounded-lg px-3 py-2 text-white z-[100]`}
    >
      {msg}
    </div>
  );
};
