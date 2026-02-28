import React from "react"
import { Editor } from "../../editor"
import { DocPropertyGlobal } from "../../../doc-property-global"

/**
 * Test example component for PropertyNavigationPlugin functionality
 */
export const PropertyNavigationTestExample: React.FC = () => {
  const testDocId = "test-doc-property-navigation"

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">
          Property Navigation Plugin Test
        </h1>
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
          <h3 className="font-semibold text-blue-800 mb-2">
            Bidirectional Navigation Test:
          </h3>
          <div className="space-y-3">
            <div>
              <h4 className="font-medium text-blue-800">
                📝 Editor → Property Panel:
              </h4>
              <ol className="list-decimal list-inside text-blue-700 space-y-1 ml-4">
                <li>
                  Click on the editor area and position the cursor at the
                  beginning of the first line of the document
                </li>
                <li>
                  Press the{" "}
                  <kbd className="px-2 py-1 bg-gray-200 rounded text-xs">↑</kbd>{" "}
                  up arrow key
                </li>
                <li>
                  Observe if the property panel is activated (gains focus and
                  selects the **last** property)
                </li>
              </ol>
            </div>
            <div>
              <h4 className="font-medium text-blue-800">
                🏷️ Property Panel → Editor:
              </h4>
              <ol className="list-decimal list-inside text-blue-700 space-y-1 ml-4">
                <li>
                  Use up/down arrow keys to navigate in the property panel (no
                  cycling)
                </li>
                <li>
                  On the last property, press the{" "}
                  <kbd className="px-2 py-1 bg-gray-200 rounded text-xs">↓</kbd>{" "}
                  down arrow key
                </li>
                <li>
                  Or press the{" "}
                  <kbd className="px-2 py-1 bg-gray-200 rounded text-xs">
                    Esc
                  </kbd>{" "}
                  key to jump immediately
                </li>
                <li>Observe if the editor regains focus</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor area */}
        <div className="lg:col-span-2">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <span className="text-sm font-medium text-gray-600">
                Document Editor
              </span>
            </div>
            <div className="p-4">
              <Editor
                isActive
                isEditable={true}
                docId={testDocId}
                title="Test Document"
                showTitle
                autoFocus
                placeholder="Start typing here, then move the cursor to the beginning of the first line and press the up arrow..."
                propertyComponent={<DocPropertyGlobal docId={testDocId} />}
              />
            </div>
          </div>
        </div>

        {/* Property panel area */}
        <div className="lg:col-span-1">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <span className="text-sm font-medium text-gray-600">
                Property Panel
              </span>
            </div>
            <div className="p-4">
              <DocPropertyGlobal docId={testDocId} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold mb-2">Expected Behavior:</h3>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-gray-800">
              📝 Editor → Property Panel:
            </h4>
            <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
              <li>
                When the cursor is at the beginning of the first line of the
                document, pressing the up arrow key will activate the property
                panel
              </li>
              <li>
                The property panel will gain focus and show keyboard navigation
                state
              </li>
              <li>
                If properties exist, the **last** property will be selected
              </li>
              <li>
                Only triggers at the absolute beginning of the document, other
                positions work normally with up arrow
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-800">
              🏷️ Property Panel → Editor:
            </h4>
            <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
              <li>
                Pressing the down arrow key on the last property will jump back
                to the editor
              </li>
              <li>
                Pressing the Esc key will immediately jump back to the editor
              </li>
              <li>
                If there are no properties, pressing the down arrow key will
                directly jump to the editor
              </li>
              <li>
                The editor will regain focus and position at the beginning of
                the document
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PropertyNavigationTestExample
