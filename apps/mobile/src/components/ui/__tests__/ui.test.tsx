import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { Button, Checkbox, EmptyState, Segmented } from '@/components/ui';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('ui kit', () => {
  it('renders an accessible button that fires onPress', () => {
    const onPress = jest.fn();
    wrap(<Button title="Save task" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Save task' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire while loading', () => {
    const onPress = jest.fn();
    wrap(<Button title="Save" loading onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows an empty state with its action', () => {
    const onAction = jest.fn();
    wrap(<EmptyState icon="list-outline" title="No tasks yet" body="Add your first task" actionLabel="Add task" onAction={onAction} />);
    expect(screen.getByText('No tasks yet')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Add task' }));
    expect(onAction).toHaveBeenCalled();
  });

  it('exposes checkbox and tab state to screen readers', () => {
    const onToggle = jest.fn();
    const onChange = jest.fn();
    wrap(
      <>
        <Checkbox checked={false} onToggle={onToggle} label="Complete Buy milk" />
        <Segmented options={[{ value: 'a', label: 'Tasks' }, { value: 'b', label: 'Calendar' }]} value="a" onChange={onChange} />
      </>,
    );
    fireEvent.press(screen.getByRole('checkbox', { name: 'Complete Buy milk' }));
    expect(onToggle).toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: 'Tasks' }).props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByRole('tab', { name: 'Calendar' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
