export interface LiveRegionProps {
  message: string;
  politeness?: 'polite' | 'assertive';
}

const LiveRegion: React.FC<LiveRegionProps> = ({
  message,
  politeness = 'polite',
}: LiveRegionProps): React.JSX.Element => {
  return (
    <div
      aria-atomic="true"
      aria-live={politeness}
      role="status"
      style={{
        blockSize: 1,
        clip: 'rect(0 0 0 0)',
        clipPath: 'inset(50%)',
        inlineSize: 1,
        overflow: 'hidden',
        position: 'absolute',
        whiteSpace: 'nowrap',
      }}
    >
      {message}
    </div>
  );
};

export default LiveRegion;
