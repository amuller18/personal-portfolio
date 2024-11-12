export default function AboutMe() {
  return (
    <section id="AboutMe" className="about--section">
      <div className="about--section--img">
        <img src="./img/about_me_img_graphic.png" alt="About Me" style={{borderWidth: 2, borderColor: 'blue', borderStyle : 'darkblue'}}/>
      </div>
      <div className="hero--section--content--box about--section--box">
        <div className="hero--section--content">
          <p className="section--title">About</p>
          <h1 className="skills-section--heading">About Me</h1>
          <p className="hero--section-description">
          I’m the co-founder of TutorMatch, a tutor-matching platform built on Bubble.io, which facilitated over 30 tutoring sessions within its first two months. 
          Before TutorMatch, I ran a thriving online business in high school, generating over $10,000 in revenue by providing sneaker enthusiasts with tools and strategies to streamline their buying and selling processes.
          </p>
          <p className="hero--section-description">
            More recently, at Wisepal, I worked with large datasets, leveraging Natural Language Processing (NLP) and clustering techniques to analyze thousands of emails. My contributions included developing automation scripts for data organization and collection, which significantly enhanced our team’s workflow and data accuracy. 
            Through each experience, I’ve honed a data-driven, results-oriented approach to problem-solving that I bring to every project.
          </p>
        </div>
      </div>
    </section>
  );
}
