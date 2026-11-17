import type {
  FieldsetHTMLAttributes,
  FormHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cx } from "@/lib/cx";

/**
 * Field (components/Field): a labelled input. `.field` holds `.label`, `.input` and, where needed,
 * `.hint` or `.field-error` (tied by `aria-describedby`, with `aria-invalid="true"` on the input).
 * A group of checks is a `fieldset.field` with a `legend.label` (`FieldSet`, `Legend`).
 */
export function Field({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx("field", className)} />;
}

export function FieldSet({
  className,
  ...rest
}: FieldsetHTMLAttributes<HTMLFieldSetElement>) {
  return <fieldset {...rest} className={cx("field", className)} />;
}

export function Label({
  className,
  ...rest
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...rest} className={cx("label", className)} />;
}

export function Legend({
  className,
  ...rest
}: HTMLAttributes<HTMLLegendElement>) {
  return <legend {...rest} className={cx("label", className)} />;
}

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx("input", className)} />;
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx("input", className)} />;
}

export function Hint({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...rest} className={cx("hint", className)} />;
}

/** The mark and the sentence under a field; it leaves when that field is edited. */
export function FieldError({
  className,
  ...rest
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...rest} className={cx("field-error", className)} />;
}

/** A checkbox or radio with its label: `label.check`; the caller puts the `input` first. */
export function Check({
  className,
  ...rest
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...rest} className={cx("check", className)} />;
}

/** Fields and their button on one line, aligned at the end: `form.form-row`. */
export function FormRow({
  className,
  ...rest
}: FormHTMLAttributes<HTMLFormElement>) {
  return <form {...rest} className={cx("form-row", className)} />;
}

/**
 * Notice: the message over a form when a send failed as a whole (`danger`: `.notice-danger`, with
 * `role="alert"` from the caller); it stays until the next send answers.
 */
export interface NoticeProps extends HTMLAttributes<HTMLParagraphElement> {
  danger?: boolean;
}

export function Notice({ danger = false, className, ...rest }: NoticeProps) {
  return (
    <p
      {...rest}
      className={cx("notice", danger && "notice-danger", className)}
    />
  );
}
