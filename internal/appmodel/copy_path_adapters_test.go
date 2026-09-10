package appmodel

type clipboardWriterFunc func(string) error

func (writer clipboardWriterFunc) WriteText(text string) error {
	return writer(text)
}

type revealPortFunc func(string) error

func (port revealPortFunc) Reveal(path string) error {
	return port(path)
}
