import { FolderScreen } from "@/components/folder-screen";

export default function TrashPage() {
  return (
    <FolderScreen
      title="Trash"
      folder="trash"
      emptyNote="Messages you delete from a conversation land here rather than disappearing."
    />
  );
}
