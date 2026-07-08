// 동네 간판 — A자형(검정) 또는 아치형(흰색). 지역 광고 자리표시.
export default function Signboard({ style = "a" }) {
  const isArch = style === "arch" || style === "arc";
  return (
    <div className={`st-signboard ${isArch ? "st-sign--arch" : "st-sign--a"}`}>
      <div className="st-sign-panel">
        <div className="st-sign-badge">우리동네 광고</div>
        <div className="st-sign-ad">
          <span className="st-ad-line" />
          <span className="st-ad-line short" />
        </div>
      </div>
      {!isArch && <div className="st-sign-legs" />}
    </div>
  );
}
