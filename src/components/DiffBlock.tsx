import React from 'react';

interface DiffBlockProps {
  diffText: string;
  maxHeightClass?: string;
}

export const DiffBlock: React.FC<DiffBlockProps> = ({
  diffText,
  maxHeightClass = 'max-h-72',
}) => {
  const lines = diffText.split('\n');

  return (
    <div
      className={`overflow-auto rounded-lg border border-[#242E3F] bg-[#0B0E14] font-mono text-xs leading-5 ${maxHeightClass}`}
    >
      <div className="min-w-max py-2">
        {lines.map((line, idx) => {
          const isAdd = line.startsWith('+') && !line.startsWith('+++');
          const isDel = line.startsWith('-') && !line.startsWith('---');
          const isHeader =
            line.startsWith('---') ||
            line.startsWith('+++') ||
            line.startsWith('@@');

          let rowStyle = 'text-[#C9D4E6]';
          if (isAdd) rowStyle = 'bg-[#22C55E]/12 text-[#86EFAC]';
          else if (isDel) rowStyle = 'bg-[#EF4444]/12 text-[#FCA5A5]';
          else if (isHeader) rowStyle = 'bg-[#18202D]/70 text-[#8C99B0]';

          return (
            <div key={idx} className={`flex px-3 ${rowStyle}`}>
              <span className="mr-3 w-7 shrink-0 select-none text-right text-[#5C6880]">
                {idx + 1}
              </span>
              <span className="whitespace-pre">{line || ' '}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
