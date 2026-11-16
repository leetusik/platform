"use client";

import { useEffect, useState, type Ref } from "react";

import { COPY } from "@/content/hi2vi-frame";
import { buttonClass, FieldError, Swap } from "@/hi2vi/ui";

import { blockCopyLabel, copyMachine, type CopyResult } from "./copy-state";

/**
 * Copy (`Copy.dc.html`): a read-only value beside its **Copy** button, whose label becomes **Copied**
 * for 2 s at the same width (one `.swap` cell); a refused copy adds the failure line. The field form
 * (`.copy-field`) holds one value; `mono` and `primary` are the key's (the show-once dialog). The block
 * form (`block`, job 06 G2, `LandingCode.dc.html`) holds a command: its lines kept, scrolling sideways
 * inside its own box, the button at the block's top; its classes (`.lp-cmd`, `.lp-cmd-value`) are the
 * landing's sheet.
 */
interface CopyBase {
  /** The value copied, exactly as shown. */
  text: string;
  /** The button, for a dialog that focuses it first. */
  buttonRef?: Ref<HTMLButtonElement>;
}

export interface CopyFieldProps extends CopyBase {
  block?: false;
  /** The button's accessible name: `Copy public URL`, `Copy key`. */
  label: string;
  mono?: boolean;
  primary?: boolean;
}

export interface CopyBlockProps extends CopyBase {
  block: true;
  /** What the command is, the block's accessible name: `Install command`. */
  what: string;
}

export type CopyProps = CopyFieldProps | CopyBlockProps;

export function Copy(props: CopyProps) {
  const { text, buttonRef } = props;
  const [result, setResult] = useState<CopyResult>("rest");
  const [machine] = useState(() => copyMachine((r) => setResult(r)));
  useEffect(() => () => machine.dispose(), [machine]);

  const copied = result === "copied";
  const button = (label: string, primary: boolean) => (
    <button
      ref={buttonRef}
      type="button"
      className={buttonClass(primary ? "primary" : "default")}
      aria-label={label}
      data-swap={copied ? "true" : undefined}
      onClick={() => {
        void machine.press(
          text,
          typeof navigator === "undefined" ? undefined : navigator.clipboard,
        );
      }}
    >
      <Swap labels={[COPY.copy, COPY.copied]} />
    </button>
  );
  const said = (
    <span className="sr-only" role="status">
      {copied ? COPY.copied : ""}
    </span>
  );

  return (
    <div className="stack gap-2">
      {props.block ? (
        <div className="lp-cmd">
          <pre className="lp-cmd-value" tabIndex={0} aria-label={props.what}>
            <code>{text}</code>
          </pre>
          {button(blockCopyLabel(props.what), false)}
          {said}
        </div>
      ) : (
        <div className="copy-field">
          <span className={props.mono ? "copy-value mono" : "copy-value"}>
            {text}
          </span>
          {button(props.label, props.primary ?? false)}
          {said}
        </div>
      )}
      {result === "failed" ? (
        <FieldError role="alert">{COPY.failed}</FieldError>
      ) : null}
    </div>
  );
}
