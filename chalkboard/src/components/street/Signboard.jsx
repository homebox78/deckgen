// 동네 간판 — A자형(검정, 바닥에 세움) 또는 아치형(흰색). 지역 광고 자리.
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
      {/* A자 받침대 (세움 간판) */}
      {!isArch && (
        <div className="st-aframe">
          <span className="st-aleg st-aleg--l" />
          <span className="st-aleg st-aleg--r" />
          <span className="st-abar" />
        </div>
      )}
    </div>
  );
}
