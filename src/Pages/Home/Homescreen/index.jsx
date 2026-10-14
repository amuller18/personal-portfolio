import { storyOrder } from "../../../data/story";
import Chapter from "../Chapter";
import ChapterRail from "../ChapterRail";
import { Contact, SideQuests, Toolkit } from "../Extras";
import HeroSection from "../HeroSection";
import Interlude from "../Interlude";
import NextChapter from "../NextChapter";
import NextChapterButton from "../NextChapterButton";
import TraderRanker from "../TraderRanker";
import WallStreet from "../WallStreet";

/* Sections with bespoke layouts; everything else uses the standard Chapter. */
const CUSTOM = {
  offline: Interlude,
  traderranker: TraderRanker,
  wolfe: WallStreet,
  next: NextChapter,
};

export default function Home() {
  return (
    <>
      <ChapterRail items={storyOrder} />
      <NextChapterButton items={storyOrder} />
      <main>
        <HeroSection />
        {storyOrder.map((section) => {
          const Custom = CUSTOM[section.id];
          return Custom ? (
            <Custom key={section.id} />
          ) : (
            <Chapter key={section.id} chapter={section} />
          );
        })}
        <SideQuests />
        <Toolkit />
      </main>
      <Contact />
    </>
  );
}
