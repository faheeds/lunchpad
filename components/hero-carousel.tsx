"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type HeroCarouselSlide = { src: string; alt: string };

type Props = {
  slides: HeroCarouselSlide[];
  gradientFrom: string;
  gradientTo: string;
  restaurantName: string;
  labels: { type: string };
  menuSummary: string;
  cutoffCopy?: string;
};

export function HeroCarousel({ slides, gradientFrom, gradientTo, restaurantName, labels }: Props) {
  const hasSlides = slides.length > 0;
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  // Ref-based resume timer — avoids re-renders from a state-based timer
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const count = slides.length;

  const goTo = (idx: number) => setCurrent((idx + count) % count);
  const next = () => goTo(current + 1);
  const prev = () => goTo(current - 1);

  // Pause auto-advance and schedule a resume after 6 s
  const handleInteraction = () => {
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), 6000);
  };

  // Auto-advance interval
  useEffect(() => {
    if (!hasSlides || count <= 1 || paused) return;
    autoTimer.current = setInterval(() => {
      setCurrent((c) => (c + 1) % count);
    }, 4500);
    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
    };
  }, [hasSlides, count, paused]);

  // Cleanup resume timer on unmount
  useEffect(() => () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  // Swipe detection
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 30) return;
    handleInteraction();
    delta < 0 ? next() : prev();
  };

  const textBlock = (
    <div style={{
      background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
      padding: "24px 20px 20px",
      display: "flex", flexDirection: "column", justifyContent: "center",
    }} className="lg:flex-1 lg:min-h-[360px]">
      <p style={{
        fontSize: 13, fontWeight: 700, letterSpacing: "0.28em",
        textTransform: "uppercase", color: "var(--hero-accent)",
        marginBottom: 8, fontFamily: "var(--font-display)",
      }}>
        ★ Fresh · Daily · Delivered ★
      </p>
      <h1 style={{
        fontSize: 36, fontWeight: 700, lineHeight: 1.0,
        color: "white", marginBottom: 10,
        fontFamily: "var(--font-display)",
        textTransform: "uppercase", letterSpacing: "0.01em",
      }}>
        <span style={{ color: "var(--accent)" }}>{restaurantName}</span>
      </h1>
      <p style={{ fontSize: 15, color: "rgba(255,255,255,0.72)", marginBottom: 20, lineHeight: 1.5 }}>
        Fresh food delivered to your {labels.type.toLowerCase()} &mdash; order for tomorrow or plan the whole week.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <Link href="/order" style={{
          padding: "12px 22px", borderRadius: 100,
          fontSize: 14, fontWeight: 700, textDecoration: "none",
          background: "var(--brand-on-dark)", color: "white",
          fontFamily: "var(--font-display)",
          textTransform: "uppercase", letterSpacing: "0.08em",
          boxShadow: "0 4px 16px rgba(var(--brand-rgb),0.45)",
        }}>
          Order Single Day
        </Link>
        <Link href="/weekly" style={{
          padding: "12px 20px", borderRadius: 100,
          fontSize: 14, fontWeight: 700, textDecoration: "none",
          background: "var(--accent)", color: "var(--dark-bg)",
          fontFamily: "var(--font-display)",
          textTransform: "uppercase", letterSpacing: "0.08em",
          boxShadow: "0 4px 16px rgba(var(--accent-rgb),0.40)",
        }}>
          Plan The Week
        </Link>
      </div>
      <p style={{
        fontSize: 13, color: "rgba(255,255,255,0.50)",
        letterSpacing: "0.06em", textTransform: "uppercase",
      }}>
        {restaurantName}
      </p>
    </div>
  );

  // No photos — gradient-only treatment (matches old hero fallback)
  if (!hasSlides) {
    return (
      <div className="lg:flex lg:flex-row">
        {textBlock}
      </div>
    );
  }

  const imageBlock = (
    <div
      style={{ position: "relative", height: 220, overflow: "hidden" }}
      className="lg:flex-none lg:w-[45%] lg:h-auto lg:min-h-[360px]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={handleInteraction}
    >
      {/* Slides — cross-fade */}
      {slides.map((slide, i) => (
        <img
          key={i}
          src={slide.src}
          alt={slide.alt}
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "cover", objectPosition: "center",
            opacity: i === current ? 1 : 0,
            transition: "opacity 400ms ease",
            userSelect: "none",
          }}
          draggable={false}
        />
      ))}

      {/* Dot indicators */}
      {count > 1 && (
        <div style={{
          position: "absolute", bottom: 10, left: 0, right: 0,
          display: "flex", justifyContent: "center", gap: 6,
          zIndex: 2,
        }}>
          {slides.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              onClick={(e) => { e.stopPropagation(); handleInteraction(); goTo(i); }}
              style={{
                width: i === current ? 20 : 6,
                height: 6,
                borderRadius: 3,
                border: "none",
                background: i === current ? "white" : "rgba(255,255,255,0.45)",
                cursor: "pointer",
                padding: 0,
                transition: "width 250ms ease, background 250ms ease",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="lg:flex lg:flex-row">
      {imageBlock}
      {textBlock}
    </div>
  );
}
