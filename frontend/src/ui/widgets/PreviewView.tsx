import MarkdownView from '../components/MarkdownView';

export interface PreviewViewProps {
  source: string;
}

const PreviewView: React.FC<PreviewViewProps> = ({
  source,
}: PreviewViewProps): React.JSX.Element => <MarkdownView source={source} />;

export default PreviewView;
