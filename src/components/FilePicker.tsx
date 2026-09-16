import { useEffect, useRef } from "react";

interface FilePickerProps {
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  resetKey?: number;
}

export default function FilePicker({ handleFileChange, resetKey }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [resetKey]);

  useEffect(() => {
    const inputElement = inputRef.current;
    return () => {
        // 组件卸载时清理文件输入的值，释放内存
        if (inputElement) {
          inputElement.value = "";
        }
    }
  }, []);

  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      aria-label="选择图片文件"
      className="max-w-full text-sm text-slate-300 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-500"
      onChange={handleFileChange}
    />
  );
}
