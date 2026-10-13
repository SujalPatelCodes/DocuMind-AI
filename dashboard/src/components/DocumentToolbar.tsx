/**
 * 27px slim workspace toolbar with the centered helper line
 * “Ask me about {documentName}. View Doc”. The document name is live —
 * it updates when a new file is added.
 */
export default function DocumentToolbar({ documentName }: { documentName: string }) {
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