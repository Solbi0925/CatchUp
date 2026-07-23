import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePrototypeStore } from "../../store/PrototypeStore";
import "./intro.css";

export function IntroPage() {
  const navigate = useNavigate();
  const { dispatch } = usePrototypeStore();

  useEffect(() => {
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduceMotion ? 1_000 : 1_800;
    const timer = window.setTimeout(() => {
      dispatch({ type: "onboarding/introCompleted", payload: {} });
      navigate("/onboarding/calendar", { replace: true });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [dispatch, navigate]);

  return (
    <main className="intro-page" aria-labelledby="intro-title">
      <div className="intro-orb intro-orb-one" aria-hidden="true" />
      <div className="intro-orb intro-orb-two" aria-hidden="true" />
      <section className="intro-content">
        <span className="intro-sparkle" aria-hidden="true" />
        <h1 id="intro-title">Catch Up</h1>
        <p>
          오늘과 이번 주
          <br />
          학업 계획을 한눈에
        </p>
      </section>
    </main>
  );
}
