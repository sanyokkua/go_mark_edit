import reducer, {
    closeReadingOverlays,
    enterReading,
    leaveReading,
    resetReading,
    toggleReading,
    toggleReadingSidebar,
    toggleReadingTabs,
} from '../../../src/logic/store/readingSlice';

const initial = { active: false, sidebarShown: false, tabsShown: false };

it('starts inactive with both overlays hidden', () => {
    expect(reducer(undefined, { type: 'init' })).toEqual(initial);
});

it('hides both overlays when entering Reading mode', () => {
    const state = reducer({ active: false, sidebarShown: true, tabsShown: true }, enterReading());

    expect(state).toEqual({ active: true, sidebarShown: false, tabsShown: false });
});

it('leaves Reading mode without touching the overlay flags', () => {
    const state = reducer({ active: true, sidebarShown: true, tabsShown: false }, leaveReading());

    expect(state).toEqual({ active: false, sidebarShown: true, tabsShown: false });
});

it('toggles into Reading mode with hidden overlays and back out again', () => {
    const entered = reducer({ active: false, sidebarShown: true, tabsShown: true }, toggleReading());
    expect(entered).toEqual({ active: true, sidebarShown: false, tabsShown: false });

    expect(reducer(entered, toggleReading()).active).toBe(false);
});

it('resets to the initial state', () => {
    expect(reducer({ active: true, sidebarShown: true, tabsShown: true }, resetReading())).toEqual(initial);
});

it('toggles the sidebar and tab overlays independently', () => {
    const active = { active: true, sidebarShown: false, tabsShown: false };

    const sidebar = reducer(active, toggleReadingSidebar());
    expect(sidebar).toEqual({ active: true, sidebarShown: true, tabsShown: false });
    expect(reducer(sidebar, toggleReadingSidebar())).toEqual(active);

    const tabs = reducer(sidebar, toggleReadingTabs());
    expect(tabs).toEqual({ active: true, sidebarShown: true, tabsShown: true });
    expect(reducer(tabs, toggleReadingTabs())).toEqual(sidebar);
});

it('closes both overlays and keeps Reading mode active', () => {
    expect(reducer({ active: true, sidebarShown: true, tabsShown: true }, closeReadingOverlays())).toEqual({
        active: true,
        sidebarShown: false,
        tabsShown: false,
    });
});
