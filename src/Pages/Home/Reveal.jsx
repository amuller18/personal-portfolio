import useInView from "../../hooks/useInView";

export default function Reveal({ as: Tag = "div", delay = 0, className = "", children, ...rest }) {
  const [ref, inView] = useInView({ threshold: 0.15 });
  return (
    <Tag
      ref={ref}
      className={`reveal ${inView ? "reveal--in" : ""} ${className}`.trim()}
      style={{ transitionDelay: `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
