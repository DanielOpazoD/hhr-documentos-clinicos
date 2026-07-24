import type { CSSProperties } from "react";

type IconProps = {
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  "aria-hidden"?: boolean;
};

const glyphs = {
  Activity: "⌁",
  AlertTriangle: "△",
  Archive: "▣",
  ArrowDown: "↓",
  ArrowRight: "→",
  ArrowUp: "↑",
  Camera: "◉",
  Check: "✓",
  CheckCircle2: "●",
  ChevronDown: "⌄",
  Clipboard: "▤",
  Clock3: "◷",
  Database: "▱",
  DatabaseZap: "ϟ",
  Download: "↓",
  ExternalLink: "↗",
  Eye: "◉",
  File: "□",
  FileCheck2: "▧",
  FileHeart: "♡",
  FileImage: "▩",
  FilePlus2: "⊞",
  FileSearch: "⌕",
  FileText: "▤",
  FileUp: "↑",
  FlaskConical: "⚗",
  FolderArchive: "▣",
  FolderOpen: "▰",
  Grid2X2: "▦",
  GripVertical: "⋮",
  HardDrive: "▱",
  House: "⌂",
  List: "☷",
  Loader2: "◌",
  LockKeyhole: "◆",
  Pencil: "✎",
  PlugZap: "ϟ",
  Printer: "▦",
  QrCode: "▦",
  RadioTower: "⌁",
  RefreshCw: "↻",
  RotateCcw: "↶",
  RotateCw: "↷",
  Save: "▣",
  ScanLine: "⌗",
  Search: "⌕",
  Settings: "⚙",
  Shield: "◇",
  ShieldAlert: "◇",
  ShieldCheck: "◇",
  Smartphone: "▯",
  Sparkles: "✦",
  Stethoscope: "+",
  Trash2: "×",
  UploadCloud: "↑",
  X: "×",
  XCircle: "⊗",
} as const;

function makeIcon(glyph: string) {
  return function Icon({ size = 20, className, style }: IconProps) {
    return (
      <span
        aria-hidden="true"
        className={className}
        style={{
          ...style,
          alignItems: "center",
          display: "inline-flex",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: size,
          fontStyle: "normal",
          fontWeight: 700,
          height: size,
          justifyContent: "center",
          lineHeight: 1,
          width: size,
        }}
      >
        {glyph}
      </span>
    );
  };
}

export const Activity = makeIcon(glyphs.Activity);
export const AlertTriangle = makeIcon(glyphs.AlertTriangle);
export const Archive = makeIcon(glyphs.Archive);
export const ArrowDown = makeIcon(glyphs.ArrowDown);
export const ArrowRight = makeIcon(glyphs.ArrowRight);
export const ArrowUp = makeIcon(glyphs.ArrowUp);
export const Camera = makeIcon(glyphs.Camera);
export const Check = makeIcon(glyphs.Check);
export const CheckCircle2 = makeIcon(glyphs.CheckCircle2);
export const ChevronDown = makeIcon(glyphs.ChevronDown);
export const Clipboard = makeIcon(glyphs.Clipboard);
export const Clock3 = makeIcon(glyphs.Clock3);
export const Database = makeIcon(glyphs.Database);
export const DatabaseZap = makeIcon(glyphs.DatabaseZap);
export const Download = makeIcon(glyphs.Download);
export const ExternalLink = makeIcon(glyphs.ExternalLink);
export const Eye = makeIcon(glyphs.Eye);
export const File = makeIcon(glyphs.File);
export const FileCheck2 = makeIcon(glyphs.FileCheck2);
export const FileHeart = makeIcon(glyphs.FileHeart);
export const FileImage = makeIcon(glyphs.FileImage);
export const FilePlus2 = makeIcon(glyphs.FilePlus2);
export const FileSearch = makeIcon(glyphs.FileSearch);
export const FileText = makeIcon(glyphs.FileText);
export const FileUp = makeIcon(glyphs.FileUp);
export const FlaskConical = makeIcon(glyphs.FlaskConical);
export const FolderArchive = makeIcon(glyphs.FolderArchive);
export const FolderOpen = makeIcon(glyphs.FolderOpen);
export const Grid2X2 = makeIcon(glyphs.Grid2X2);
export const GripVertical = makeIcon(glyphs.GripVertical);
export const HardDrive = makeIcon(glyphs.HardDrive);
export const House = makeIcon(glyphs.House);
export const List = makeIcon(glyphs.List);
export const Loader2 = makeIcon(glyphs.Loader2);
export const LockKeyhole = makeIcon(glyphs.LockKeyhole);
export const Pencil = makeIcon(glyphs.Pencil);
export const PlugZap = makeIcon(glyphs.PlugZap);
export const Printer = makeIcon(glyphs.Printer);
export const QrCode = makeIcon(glyphs.QrCode);
export const RadioTower = makeIcon(glyphs.RadioTower);
export const RefreshCw = makeIcon(glyphs.RefreshCw);
export const RotateCcw = makeIcon(glyphs.RotateCcw);
export const RotateCw = makeIcon(glyphs.RotateCw);
export const Save = makeIcon(glyphs.Save);
export const ScanLine = makeIcon(glyphs.ScanLine);
export const Search = makeIcon(glyphs.Search);
export const Settings = makeIcon(glyphs.Settings);
export const Shield = makeIcon(glyphs.Shield);
export const ShieldAlert = makeIcon(glyphs.ShieldAlert);
export const ShieldCheck = makeIcon(glyphs.ShieldCheck);
export const Smartphone = makeIcon(glyphs.Smartphone);
export const Sparkles = makeIcon(glyphs.Sparkles);
export const Stethoscope = makeIcon(glyphs.Stethoscope);
export const Trash2 = makeIcon(glyphs.Trash2);
export const UploadCloud = makeIcon(glyphs.UploadCloud);
export const X = makeIcon(glyphs.X);
export const XCircle = makeIcon(glyphs.XCircle);
