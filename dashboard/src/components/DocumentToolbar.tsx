/**
 * 27px slim workspace toolbar. With a document open it shows the centered
 * helper line “Ask me about {documentName}. View Doc”; when the active
 * conversation has no PDF it invites the user to add one.
 */
export default function DocumentToolbar({ documentName }: { documentName: string }) {
  if (!documentName) {
    return (
      <div className="flex h-[27px] shrink-0 items-center justify-center border-b border-[#E9EAEC] bg-[#F4F4F5] text-[9px] text-[#6B7280]">
        <span>Add a PDF to this conversation to start asking questions about it.</span>
      </div>
    );
  }

  return (
    <div className="flex h-[27px] shrink-0 items-center justify-center border-b border-[#E9EAEC] bg-[#F4F4F5] text-[9px] text-[#374151]">
      <span>Ask me about</span>
      <span className="mx-1 max-w-[260px] truncate font-medium text-maintext">
        {documentName}
      </span>
      <span>.</span>
      <span className="mx-1.5 underline underline-offset-[3px]">View Doc</span>
    </div>
  );
}
