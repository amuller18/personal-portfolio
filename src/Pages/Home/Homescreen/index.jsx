import { chapters, nextChapter, traderRanker, wallStreet } from "../../../data/story";
import Chapter from "../Chapter";
import ChapterRail from "../ChapterRail";
import { Contact, SideQuests, Toolkit } from "../Extras";
import HeroSection from "../HeroSection";
import NextChapter from "../NextChapter";
import TraderRanker from "../TraderRanker";
import WallStreet from "../WallStreet";

const RAIL = [...chapters, traderRanker, wallStreet, nextChapter];

export default function Home() {
  return (
    <>
      <ChapterRail items={RAIL} />
      <main>
        <HeroSection />
        {chapters.map((chapter) => (
          <Chapter key={chapter.id} chapter={chapter} />
        ))}
        <TraderRanker />
        <WallStreet />
        <NextChapter />
        <SideQuests />
        <Toolkit />
      </main>
      <Contact />
    </>
  );
}
