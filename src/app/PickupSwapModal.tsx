"use client";

import { useEffect, useRef } from "react";
import PlayerFace from "./PlayerFace";

type Player = {
  id: number;
  code?: number;
  name: string;
  team: string;
  position: string;
  total: number;
  form?: number;
};

type RosterPick = {
  player_id: number;
  player_name: string;
  position: string;
  manager_id: string;
};

export default function PickupSwapModal({
  add,
  drops,
  selectedDrop,
  onChooseDrop,
  onCancel,
  onConfirm,
  moving,
  lockedReason,
  error,
  isCaptain,
}: {
  add: Player;
  drops: RosterPick[];
  selectedDrop: RosterPick | null;
  onChooseDrop: (pick: RosterPick) => void;
  onCancel: () => void;
  onConfirm: () => void;
  moving: boolean;
  lockedReason: string | null;
  error: string;
  isCaptain: (pick: RosterPick) => boolean;
}) {
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => {
    dialog.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !moving) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moving, onCancel]);

  return <div className="draftModalBackdrop swapBackdrop" onClick={(event) => {
    if (event.target === event.currentTarget && !moving) onCancel();
  }}>
    <section className="draftModal card swapModal" role="dialog" aria-modal="true" aria-labelledby="swap-modal-title" tabIndex={-1} ref={dialog}>
      <div className="eyebrow">Free agency · same-position swap</div>
      <h2 id="swap-modal-title">Add {add.name}</h2>
      <div className="swapIncoming">
        <PlayerFace name={add.name} code={add.code} position={add.position} headshot />
        <div className="grow">
          <strong>{add.name}</strong>
          <span>{add.team} · {add.position}</span>
        </div>
        <span className="swapIncomingTag">IN</span>
      </div>
      <h3>Who should you drop?</h3>
      <p className="sub swapModalIntro">Select one of your {add.position}s to release. SoccerTime will verify the move and keep the 8-player roster requirements intact.</p>
      {drops.length ? <div className="swapDropList" role="radiogroup" aria-label="Choose player to drop">
        {drops.map((pick) => <label className={`swapDropOption ${selectedDrop?.player_id === pick.player_id ? "chosen" : ""}`} key={pick.player_id}>
          <input type="radio" name="swap-drop-player" value={pick.player_id}
            checked={selectedDrop?.player_id === pick.player_id} disabled={moving || Boolean(lockedReason)}
            onChange={() => onChooseDrop(pick)} />
          <span className="swapDropRadio" aria-hidden="true" />
          <span className="swapDropName">
            <strong>{pick.player_name}</strong>
            <small>{pick.position}{isCaptain(pick) ? " · Current captain" : ""}</small>
          </span>
          <span className="swapDropTag">OUT</span>
        </label>)}
      </div> : <p className="banner error">No {add.position} is currently on your team. Finish your draft before swapping.</p>}
      {selectedDrop && isCaptain(selectedDrop) && <p className="banner swapCaptainAlert">You’re dropping your captain. Choose a new captain from Team before the next kickoff.</p>}
      {lockedReason && <p className="banner error" role="status">{lockedReason}</p>}
      {error && <p className="banner error" role="alert">{error}</p>}
      {selectedDrop && <p className="swapConfirmCopy"><b>Trade-off:</b> Drop {selectedDrop.player_name} · Add {add.name}</p>}
      <div className="draftModalActions swapModalActions">
        <button type="button" className="btn secondary" disabled={moving} onClick={onCancel}>Cancel</button>
        <button type="button" className="btn" disabled={moving || !selectedDrop || Boolean(lockedReason)} onClick={onConfirm}>
          {moving ? "Saving swap…" : selectedDrop ? "Confirm swap" : "Choose a player"}
        </button>
      </div>
    </section>
  </div>;
}
