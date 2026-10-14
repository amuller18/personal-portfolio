import { useSite } from "../../../context/SiteContext";
import { storyOrder } from "../../../data/story";
import Chapter from "../Chapter";
import ChapterRail from "../ChapterRail";
import CurrentWork from "../CurrentWork";
import { useChapterWatermarks } from "../Effects";
import { Contact, Toolkit } from "../Extras";
import HeroSection from "../HeroSection";
import Interlude from "../Interlude";
import NextChapter from "../NextChapter";
import NextChapterButton from "../NextChapterButton";
import Summary from "../Summary";
import TickerTape from "../TickerTape";
import TraderRanker from "../TraderRanker";
import WallStreet from "../WallStreet";

/* Sections with bespoke layouts; everything else uses the standard Chapter. */
const CUSTOM = {
  offline: Interlude,
  traderranker: TraderRanker,
  wolfe: WallStreet,
  now: CurrentWork,
  next: NextChapter,
};

function Story() {
  useChapterWatermarks(storyOrder);
  return (
    <>
      <ChapterRail items={storyOrder} />
      <NextChapterButton items={storyOrder} />
      <main>
        <HeroSection />
        <TickerTape />
        {storyOrder.map((section) => {
          const Custom = CUSTOM[section.id];
          return Custom ? (
            <Custom key={section.id} />
          ) : (
            <Chapter key={section.id} chapter={section} />
          );
        })}
        <TickerTape reverse />
        <Toolkit />
      </main>
      <Contact />
    </>
  );
}

export default function Home() {
  const { mode } = useSite();
  return mode === "summary" ? <Summary /> : <Story />;
}
