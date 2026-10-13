"use client";

import { useEffect, useRef, useState } from "react";

// 色選択は、パレットをドラッグしている間じゅう変更イベントが連続で発生する。そのたびに保存すると
// 保存・再読込が重なって反応が悪くなり、最後に選んだ色が確定しないことがあるため、
// 操作が止まってから(または選択欄を閉じたとき)に1回だけ保存する。
export default function DebouncedColorInput({
  value,
  onCommit,
  title,
  className,
}: {
  value: string;
  onCommit: (color: string) => void;
  title?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  const committed = useRef(value);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function commit() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (latest.current !== committed.current) {
      committed.current = latest.current;
      onCommit(latest.current);
    }
  }

  return (
    <input
      type="color"
      title={title}
      value={local}
      onChange={(e) => {
        latest.current = e.target.value;
        setLocal(e.target.value);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(commit, 700);
      }}
      onBlur={commit}
      className={className}
    />
  );
}
