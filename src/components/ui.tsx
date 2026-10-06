"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { BookOpen, ChevronRight } from "lucide-react";
import type { Word } from "../types";
export function Picker({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  items: Record<string, string>;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="picker">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(items).map(([k, v]) => (
          <SelectItem key={k} value={k}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function ProgressBar({ value }: { value: number }) {
  return (
    <Progress
      className="progress"
      value={Math.max(0, Math.min(100, value))}
      aria-label="学习进度"
    />
  );
}
export function MasteryBadge({ level = 0 }: { level?: number }) {
  return (
    <span className={"badge m" + level}>
      {["未测试", "未掌握", "待巩固", "基本掌握", "已掌握"][level]}
    </span>
  );
}
export function EmptyState({
  title = "这里还没有单词",
  description = "导入一份词表，开始你的积累。",
  children,
}: {
  title?: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <BookOpen size={36} />
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function WordListItem({
  word,
  level,
  onClick,
  extra,
}: {
  word: Word;
  level: number;
  onClick: () => void;
  extra?: string;
}) {
  return (
    <button className="word-row" onClick={onClick}>
      <span>
        <strong>{word.word}</strong>
        <small>{word.phonetic}</small>
      </span>
      <span className="word-meaning">
        {word.commonMeaning}
        {extra && <small>{extra}</small>}
      </span>
      <MasteryBadge level={level} />
      <ChevronRight size={17} />
    </button>
  );
}
export function StatCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
}) {
  return (
    <div className="stat">
      <small>{label}</small>
      <strong>
        {value}
        <em>{unit}</em>
      </strong>
    </div>
  );
}
export function AnswerOption({
  index,
  text,
  state,
  onClick,
  disabled,
}: {
  index: number;
  text: string;
  state: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button disabled={disabled} className={"answer " + state} onClick={onClick}>
      <span>{index + 1}</span>
      {text}
      {state === "right" && <b>✓</b>}
      {state === "wrong" && <b>×</b>}
    </button>
  );
}
