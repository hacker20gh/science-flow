"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface MotionWrapperProps {
  children: ReactNode;
  className?: string;
  style?: Record<string, any>;
  variants?: any;
  initial?: any;
  animate?: any;
  transition?: any;
  onClick?: () => void;
}

const FramerMotionDiv = dynamic(
  () =>
    import("framer-motion").then((m) => {
      const MotionDiv = m.motion.div;
      return function FramerMotionDivWrapper(props: MotionWrapperProps) {
        return <MotionDiv {...(props as any)} />;
      };
    }),
  {
    loading: () => <div />,
    ssr: false,
  }
);

const FramerMotionSection = dynamic(
  () =>
    import("framer-motion").then((m) => {
      const MotionSection = m.motion.section;
      return function FramerMotionSectionWrapper(props: MotionWrapperProps) {
        return <MotionSection {...(props as any)} />;
      };
    }),
  {
    loading: () => <section />,
    ssr: false,
  }
);

export { FramerMotionDiv, FramerMotionSection };
