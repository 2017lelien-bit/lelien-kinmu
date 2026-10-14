"use client";

import { useEffect, useRef, useState } from "react";

// 色選択は、パレットをドラッグしている間じゅう変更イベントが連続で発生する。そのたびに保存すると
// 保存・再読込が重なって反応が悪くなり、最後に選んだ色が確定しないことがあるため、
// 操作が止まってから(または選択欄を閉じたとき)に1回だけ保存する。
// 保存後に選択欄を作り直すと、開いているパレットが閉じてしまうため、作り直さずに同じ欄を使い続ける。
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
  const [prevValue, setPrevValue] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localRef = useRef(value);
  const valueRef = useRef(value);
  const onCommitRef = useRef(onCommit);

  // 外側の値が変わったとき(保存に失敗して元に戻った、帯色を外した等)は、表示も合わせる。
  if (value !== prevValue) {
    setPrevValue(value);
    setLocal(value);
  }

  useEffect(() => {
    localRef.current = local;
  }, [local]);

  useEffect(() => {
    valueRef.current = value;
    onCommitRef.current = onCommit;
  });

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
    if (localRef.current !== valueRef.current) onCommitRef.current(localRef.current);
  }

  return (
    <input
      type="color"
      title={title}
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(commit, 700);
      }}
      onBlur={commit}
      className={className}
    />
  );
}
