export interface Folder {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderWithCounts extends Folder {
  feedCount: number;
  unreadCount: number;
  children: FolderWithCounts[];
}
