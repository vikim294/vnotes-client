import { useEffect, useRef } from "react";

interface FilePickerProps {
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function FilePicker({ handleFileChange }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const inputElement = inputRef.current;
    return () => {
        // 组件卸载时清理文件输入的值，释放内存
        if (inputElement) {
          inputElement.value = "";
        }
    }
  }, []);

  return <input ref={inputRef} type="file" className="max-w-full" onChange={handleFileChange} />;
}
