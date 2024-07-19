import { renderHook } from '@testing-library/react-hooks';
import {PUNCTUATION} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import {LexicalEditor} from "lexical";
import {useBasicTypeaheadTriggerMatch} from "./hook.ts";

describe('useBasicTypeaheadTriggerMatch', () => {
  const editor:LexicalEditor = {} as LexicalEditor;

  it('should match when the trigger is at the start of the text', () => {
    const { result } = renderHook(() =>
      useBasicTypeaheadTriggerMatch('@', { minLength: 1 })
    );
    const triggerFn = result.current;
    const matchResult = triggerFn('@test',editor);
    expect(matchResult).toEqual({
      leadOffset: 0,
      matchingString: 'test',
      replaceableString: '@test',
    });
  });

  it('should not match when the trigger is followed by punctuation', () => {
    const { result } = renderHook(() =>
      useBasicTypeaheadTriggerMatch('@', { minLength: 1 })
    );
    const triggerFn = result.current;
    const matchResult = triggerFn('@!',editor);
    expect(matchResult).toBeNull();
  });

  it('should match when the trigger is preceded by whitespace', () => {
    const { result } = renderHook(() =>
      useBasicTypeaheadTriggerMatch('@', { minLength: 1 })
    );
    const triggerFn = result.current;
    const matchResult = triggerFn(' @test',editor);
    expect(matchResult).toEqual({
      leadOffset: 1,
      matchingString: 'test',
      replaceableString: '@test',
    });
  });

  it('should not match when the string length is less than minLength', () => {
    const { result } = renderHook(() =>
      useBasicTypeaheadTriggerMatch('@', { minLength: 2 })
    );
    const triggerFn = result.current;
    const matchResult = triggerFn('@t',editor);
    expect(matchResult).toBeNull();
  });

  it('should match when the string length is equal to maxLength', () => {
    const maxLength = 10;
    const { result } = renderHook(() =>
      useBasicTypeaheadTriggerMatch('@', { maxLength })
    );
    const triggerFn = result.current;
    const matchResult = triggerFn('@'.concat('a'.repeat(maxLength)),editor);
    expect(matchResult).toEqual({
      leadOffset: 0,
      matchingString: 'a'.repeat(maxLength),
      replaceableString: '@'.concat('a'.repeat(maxLength)),
    });
  });

  it('should not match when the string length exceeds maxLength', () => {
    const maxLength = 10;
    const { result } = renderHook(() =>
      useBasicTypeaheadTriggerMatch('@', { maxLength })
    );
    const triggerFn = result.current;
    const matchResult = triggerFn('@'.concat('a'.repeat(maxLength + 1)),editor);
    expect(matchResult).toBeNull();
  });
});
