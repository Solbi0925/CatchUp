import aiMateNeutral from "../../../assets/ai-mate-neutral.png";

export function AiMateCharacter({ size = 46 }: { size?: number }) {
  return (
    <img
      className="ai-character"
      src={aiMateNeutral}
      alt="AI Mate 캐릭터"
      width={size}
      height={size}
      draggable={false}
    />
  );
}
