"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./FloatingNav.module.css";

// Controlled by the current route. The local index starts moving as soon as a
// tab is tapped, while aria-current always reflects the actual destination.
export default function FloatingNav({ items, activeIndex, label }) {
  const [indicatorIndex, setIndicatorIndex] = useState(activeIndex);

  useEffect(() => {
    setIndicatorIndex(activeIndex);
  }, [activeIndex]);

  return (
    <nav className="bt-nav lg:hidden" aria-label={label}>
      <div className={`bt-nav-bar ${styles.track}`}>
        {indicatorIndex >= 0 && (
          <span
            aria-hidden="true"
            className={styles.indicator}
            style={{ transform: `translateX(${indicatorIndex * 100}%)` }}
          />
        )}
        {items.map((item, index) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={activeIndex === index ? "page" : undefined}
            className={styles.item}
            onClick={(event) => {
              if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                setIndicatorIndex(index);
              }
            }}
          >
            <span className={styles.icon}>
              {item.icon}
              {item.badge}
            </span>
            <span className={styles.label}>{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
