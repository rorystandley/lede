import type { FolderWithCounts } from '@news-reader/shared';

interface Props {
  folders: FolderWithCounts[];
  value: string | null;
  onChange: (folderId: string | null) => void;
  className?: string;
}

export function FolderPicker({ folders, value, onChange, className }: Props) {
  const flatFolders = flattenFolders(folders);

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={`px-2.5 py-1.5 text-sm bg-surface border border-border rounded text-text-primary ${className ?? ''}`}
    >
      <option value="">No folder</option>
      {flatFolders.map(({ folder, depth }) => (
        <option key={folder.id} value={folder.id}>
          {'  '.repeat(depth)}{folder.name}
        </option>
      ))}
    </select>
  );
}

function flattenFolders(
  folders: FolderWithCounts[],
  depth = 0,
): { folder: FolderWithCounts; depth: number }[] {
  const result: { folder: FolderWithCounts; depth: number }[] = [];
  for (const folder of folders) {
    result.push({ folder, depth });
    if (folder.children.length > 0) {
      result.push(...flattenFolders(folder.children, depth + 1));
    }
  }
  return result;
}
