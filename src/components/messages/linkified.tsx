import { Fragment } from "react";

const URL_PATTERN = /(https?:\/\/[^\s<]+)/g;

/** Texto com os endereços http(s) virando links. */
export function Linkified({ text, className }: { text: string; className?: string }) {
  const pieces = text.split(URL_PATTERN);
  return pieces.map((piece, index) => {
    if (index % 2 === 0) return <Fragment key={index}>{piece}</Fragment>;
    // Pontuação no fim ("veja https://x.com.") fica fora do link.
    const [, url, trailing] = piece.match(/^(.*?)([.,;:!?)\]]*)$/) ?? [piece, piece, ""];
    return (
      <Fragment key={index}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={className ?? "break-all text-primary-ink underline underline-offset-2"}
        >
          {url}
        </a>
        {trailing}
      </Fragment>
    );
  });
}
