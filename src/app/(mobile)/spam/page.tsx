import { FolderScreen } from "@/components/folder-screen";

export default function SpamPage() {
  return (
    <FolderScreen
      title="Spam"
      folder="spam"
      emptyNote="Messages you move here from a conversation will appear in this list."
    />
  );
}
