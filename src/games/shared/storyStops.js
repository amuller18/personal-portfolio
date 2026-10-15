/*
 * Adapter between the site's story data and the games. Every game mode is a
 * sequence of "stops": a start screen, one stop per chapter, and a finish.
 * Swap or reorder chapters in data/story.js and every game follows along.
 */
import { hero, profile, storyOrder } from "../../data/story";

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
};

export function chapterStop(section) {
  return {
    kind: "chapter",
    id: section.id,
    number: section.number,
    era: section.era,
    title: section.title,
    headline: section.headline,
    summary: toArray(section.body ?? section.intro)[0] ?? "",
    stats: (section.stats ?? []).slice(0, 3),
    bullets: (section.goals ?? []).map((goal) => goal.title),
    lesson: section.lesson ?? null,
    href: `/#${section.id}`,
    ski: section.ski ?? {},
  };
}

export function buildStoryStops(sections = storyOrder) {
  return [
    {
      kind: "start",
      id: "start",
      title: profile.name,
      headline: hero.blurb,
      lines: [profile.role, profile.school],
    },
    ...sections.map(chapterStop),
    {
      kind: "finish",
      id: "finish",
      title: "Finish",
      headline:
        "If you're building something at the edge of data, AI, and finance, " +
        "I'd love to hear about it.",
      links: [
        { label: "Email", href: `mailto:${profile.email}` },
        { label: "LinkedIn", href: profile.linkedin },
        { label: "GitHub", href: profile.github },
      ],
    },
  ];
}
