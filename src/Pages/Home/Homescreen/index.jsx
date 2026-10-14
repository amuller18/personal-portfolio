import { Fragment } from "react";
import { chapters, interlude, nextChapter, traderRanker, wallStreet } from "../../../data/story";
import Chapter from "../Chapter";
import ChapterRail from "../ChapterRail";
import { Contact, SideQuests, Toolkit } from "../Extras";
import HeroSection from "../HeroSection";
import Interlude from "../Interlude";
import NextChapter from "../NextChapter";
import TraderRanker from "../TraderRanker";
import WallStreet from "../WallStreet";

/* The interlude sits between the Tel Aviv chapter and TutorMatch. */
const INTERLUDE_AFTER = "telaviv";
const RAIL = chapters
  .flatMap((chapter) => (chapter.id === INTERLUDE_AFTER ? [chapter, interlude] : [chapter]))
  .concat(traderRanker, wallStreet, nextChapter);

export default function Home() {
  return (
    <>
      <ChapterRail items={RAIL} />
      <main>
        <HeroSection />
        {chapters.map((chapter) => (
          <Fragment key={chapter.id}>
            <Chapter chapter={chapter} />
            {chapter.id === INTERLUDE_AFTER && <Interlude />}
          </Fragment>
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
