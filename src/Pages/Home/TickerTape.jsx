import { ticker } from "../../data/story";

/* Stock-ticker tape of highlights. Content is duplicated for a seamless loop. */
export default function TickerTape({ reverse = false }) {
  const items = [...ticker, ...ticker];
  return (
    <div className={`ticker ${reverse ? "ticker--reverse" : ""}`} aria-hidden="true">
      <div className="ticker__track">
        {items.map((item, i) => (
          <span key={i} className="ticker__item">
            <strong>{item.sym}</strong>
            <span>{item.val}</span>
            <em className={item.up ? "is-up" : "is-down"}>{item.up ? "▲" : "▼"}</em>
          </span>
        ))}
      </div>
    </div>
  );
}
