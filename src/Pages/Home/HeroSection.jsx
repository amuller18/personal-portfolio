import { Link } from "react-scroll";

export default function HeroSection() {
  return (
    <section id="heroSection" className="hero--section">
      <div className="hero--section--content--box">
        <div className="hero--section--content">
          <p className="section--title">Hi, I'm Alex</p>
          <h1 className="hero--section--title">
            <span className="hero--section-title--color">Computer Engineering</span>{" "}
            <br />
            Student
          </h1>
          <p className="hero--section-description">
          I'm a results-driven developer and entrepreneur, passionate about building impactful solutions that solve real-world problems.
            <br />  With a focus on innovation and user experience, I create projects that make technology accessible, engaging, and effective.
          </p>
          </div>
        </div>
      <div className="hero--section--img">
        <img src="./img/hero_img.png" alt="Hero Section" />
      </div>
    </section>
  );
}
